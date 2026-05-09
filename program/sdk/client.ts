/**
 * LockNRollClient — frontend가 raw account/seed/discriminator를 만지지 않도록
 * 7개(+governance 2개) 인스트럭션을 typed 메서드로 wrapping.
 *
 * 모든 결제 인스트럭션은 set_compute_unit_limit를 prepend (D5에서 측정한 값으로 SDK가 채움).
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  TransactionSignature,
  ComputeBudgetProgram,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import BN from "bn.js";
import { configPda, listingPda, bidPda, nextListingNonce } from "./seeds";
import { computeTotalUsdcRaw } from "./pricing";
import {
  CreateListingParams,
  SubmitBidParams,
  BuyNowParams,
  AcceptBidParams,
  WithdrawBidParams,
  CancelListingParams,
  ClaimExpiredParams,
  InitConfigParams,
  TxResult,
} from "./types";

/** D5 측정 후 채울 인스트럭션별 CU. 일단 보수적 추정값. */
const CU = {
  createListing: 200_000,
  submitBid: 80_000,
  buyNow: 200_000,
  acceptBid: 250_000,
  withdrawBid: 80_000,
  cancelListing: 200_000,
  claimExpired: 200_000,
};

export const STREAMFLOW_DEVNET_PROGRAM = new PublicKey(
  "HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ"
);
export const STREAMFLOW_MAINNET_PROGRAM = new PublicKey(
  "strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m"
);

export class LockNRollClient {
  readonly program: anchor.Program<any>;
  readonly programId: PublicKey;
  readonly streamflowProgramId: PublicKey;

  constructor(
    program: anchor.Program<any>,
    opts: { streamflowProgramId?: PublicKey } = {}
  ) {
    this.program = program;
    this.programId = program.programId;
    this.streamflowProgramId =
      opts.streamflowProgramId ?? STREAMFLOW_DEVNET_PROGRAM;
  }

  // ── Read helpers ────────────────────────────────────────────────

  configPda(): PublicKey {
    return configPda(this.programId)[0];
  }

  listingPda(
    maker: PublicKey,
    streamflowMetadata: PublicKey,
    nonce: bigint
  ): PublicKey {
    return listingPda(this.programId, maker, streamflowMetadata, nonce)[0];
  }

  bidPda(listing: PublicKey, bidder: PublicKey): PublicKey {
    return bidPda(this.programId, listing, bidder)[0];
  }

  async fetchConfig() {
    return this.program.account.config.fetch(this.configPda());
  }

  async fetchListing(listing: PublicKey) {
    return this.program.account.listing.fetch(listing);
  }

  async fetchBid(bid: PublicKey) {
    return this.program.account.bid.fetch(bid);
  }

  async fetchAllListings() {
    return this.program.account.listing.all();
  }

  async fetchListingsByMaker(maker: PublicKey) {
    return this.program.account.listing.all([
      { memcmp: { offset: 8, bytes: maker.toBase58() } },
    ]);
  }

  async fetchOpenBidsByListing(listing: PublicKey) {
    return this.program.account.bid.all([
      { memcmp: { offset: 8, bytes: listing.toBase58() } },
    ]);
  }

  async fetchBidsByBidder(bidder: PublicKey) {
    return this.program.account.bid.all([
      { memcmp: { offset: 40, bytes: bidder.toBase58() } },
    ]);
  }

  // ── Governance ──────────────────────────────────────────────────

  async initConfig(p: InitConfigParams, authority: Keypair): Promise<TxResult> {
    const sig = await this.program.methods
      .initConfig(p.usdcMint, p.feeRecipient, p.feeBps, p.expectedStreamflowVersion)
      .accounts({
        authority: authority.publicKey,
        config: this.configPda(),
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();
    return { signature: sig };
  }

  // ── Maker flow ──────────────────────────────────────────────────

  async createListing(
    p: CreateListingParams,
    maker: Keypair
  ): Promise<TxResult & { listing: PublicKey; nonce: bigint }> {
    const nonce = p.nonce ?? nextListingNonce();
    const expiresAtSec = new BN(Math.floor(p.expiresAt.getTime() / 1000));
    const askingPriceArg = p.askingPriceMicroUsdc
      ? new BN(p.askingPriceMicroUsdc.toString())
      : null;

    const listing = this.listingPda(maker.publicKey, p.streamflowMetadata, nonce);
    const listingTokenAta = getAssociatedTokenAddressSync(
      p.tokenMint,
      listing,
      true
    );

    const sig = await this.program.methods
      .createListing(new BN(nonce.toString()), askingPriceArg, expiresAtSec)
      .accounts({
        maker: maker.publicKey,
        tokenMint: p.tokenMint,
        streamflowMetadata: p.streamflowMetadata,
        listing,
        listingTokenAta,
        config: this.configPda(),
        streamflowProgram: this.streamflowProgramId,
        rent: SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: CU.createListing }),
      ])
      .signers([maker])
      .rpc();
    return { signature: sig, listing, nonce };
  }

  async cancelListing(
    p: CancelListingParams,
    maker: Keypair
  ): Promise<TxResult> {
    const listingAcc = await this.fetchListing(p.listing);
    const tokenMint: PublicKey = listingAcc.tokenMint;
    const listingTokenAta = getAssociatedTokenAddressSync(tokenMint, p.listing, true);
    const makerTokenAta = getAssociatedTokenAddressSync(tokenMint, maker.publicKey);

    const sig = await this.program.methods
      .cancelListing()
      .accounts({
        maker: maker.publicKey,
        listing: p.listing,
        tokenMint,
        streamflowMetadata: listingAcc.streamflowMetadata,
        listingTokenAta,
        makerTokenAta,
        config: this.configPda(),
        streamflowProgram: this.streamflowProgramId,
        rent: SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([
        createAssociatedTokenAccountIdempotentInstruction(
          maker.publicKey,
          makerTokenAta,
          maker.publicKey,
          tokenMint
        ),
        ComputeBudgetProgram.setComputeUnitLimit({ units: CU.cancelListing }),
      ])
      .signers([maker])
      .rpc();
    return { signature: sig };
  }

  async acceptBid(p: AcceptBidParams, maker: Keypair): Promise<TxResult> {
    const listingAcc = await this.fetchListing(p.listing);
    const cfg = await this.fetchConfig();
    const tokenMint: PublicKey = listingAcc.tokenMint;
    const usdcMint: PublicKey = cfg.usdcMint;

    const bid = this.bidPda(p.listing, p.bidder);
    const listingTokenAta = getAssociatedTokenAddressSync(tokenMint, p.listing, true);
    const bidderTokenAta = getAssociatedTokenAddressSync(tokenMint, p.bidder);
    const bidVault = getAssociatedTokenAddressSync(usdcMint, bid, true);
    const makerUsdcAta = getAssociatedTokenAddressSync(usdcMint, maker.publicKey);
    const feeRecipientUsdcAta = getAssociatedTokenAddressSync(usdcMint, cfg.feeRecipient);

    const sig = await this.program.methods
      .acceptBid()
      .accounts({
        maker: maker.publicKey,
        bidder: p.bidder,
        listing: p.listing,
        bid,
        tokenMint,
        streamflowMetadata: listingAcc.streamflowMetadata,
        listingTokenAta,
        bidderTokenAta,
        bidVault,
        makerUsdcAccount: makerUsdcAta,
        feeRecipientUsdcAccount: feeRecipientUsdcAta,
        config: this.configPda(),
        streamflowProgram: this.streamflowProgramId,
        rent: SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([
        createAssociatedTokenAccountIdempotentInstruction(
          maker.publicKey,
          bidderTokenAta,
          p.bidder,
          tokenMint
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          maker.publicKey,
          makerUsdcAta,
          maker.publicKey,
          usdcMint
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          maker.publicKey,
          feeRecipientUsdcAta,
          cfg.feeRecipient,
          usdcMint
        ),
        ComputeBudgetProgram.setComputeUnitLimit({ units: CU.acceptBid }),
      ])
      .signers([maker])
      .rpc();
    return { signature: sig };
  }

  // ── Taker / Bidder flow ─────────────────────────────────────────

  async buyNow(p: BuyNowParams, taker: Keypair): Promise<TxResult> {
    const listingAcc = await this.fetchListing(p.listing);
    const cfg = await this.fetchConfig();
    const tokenMint: PublicKey = listingAcc.tokenMint;
    const usdcMint: PublicKey = cfg.usdcMint;
    const maker: PublicKey = listingAcc.maker;

    const listingTokenAta = getAssociatedTokenAddressSync(tokenMint, p.listing, true);
    const takerTokenAta = getAssociatedTokenAddressSync(tokenMint, taker.publicKey);
    const takerUsdcAta = getAssociatedTokenAddressSync(usdcMint, taker.publicKey);
    const makerUsdcAta = getAssociatedTokenAddressSync(usdcMint, maker);
    const feeRecipientUsdcAta = getAssociatedTokenAddressSync(
      usdcMint,
      cfg.feeRecipient
    );

    const sig = await this.program.methods
      .buyNow()
      .accounts({
        taker: taker.publicKey,
        maker,
        listing: p.listing,
        tokenMint,
        streamflowMetadata: listingAcc.streamflowMetadata,
        listingTokenAta,
        takerTokenAta,
        takerUsdcAccount: takerUsdcAta,
        makerUsdcAccount: makerUsdcAta,
        feeRecipientUsdcAccount: feeRecipientUsdcAta,
        config: this.configPda(),
        streamflowProgram: this.streamflowProgramId,
        rent: SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([
        createAssociatedTokenAccountIdempotentInstruction(
          taker.publicKey,
          takerTokenAta,
          taker.publicKey,
          tokenMint
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          taker.publicKey,
          makerUsdcAta,
          maker,
          usdcMint
        ),
        createAssociatedTokenAccountIdempotentInstruction(
          taker.publicKey,
          feeRecipientUsdcAta,
          cfg.feeRecipient,
          usdcMint
        ),
        ComputeBudgetProgram.setComputeUnitLimit({ units: CU.buyNow }),
      ])
      .signers([taker])
      .rpc();
    return { signature: sig };
  }

  async submitBid(p: SubmitBidParams, bidder: Keypair): Promise<TxResult> {
    const listingAcc = await this.fetchListing(p.listing);
    const cfg = await this.fetchConfig();
    const usdcMint: PublicKey = cfg.usdcMint;

    const total =
      p.totalUsdcRaw ??
      computeTotalUsdcRaw(
        p.pricePerTokenMicroUsdc,
        listingAcc.vestingAmountRaw,
        listingAcc.tokenDecimals
      );

    const bid = this.bidPda(p.listing, bidder.publicKey);
    const bidVault = getAssociatedTokenAddressSync(usdcMint, bid, true);
    const bidderUsdcAta = getAssociatedTokenAddressSync(usdcMint, bidder.publicKey);

    const sig = await this.program.methods
      .submitBid(new BN(p.pricePerTokenMicroUsdc.toString()), total)
      .accounts({
        bidder: bidder.publicKey,
        listing: p.listing,
        bid,
        usdcMint,
        bidVault,
        bidderUsdcAccount: bidderUsdcAta,
        config: this.configPda(),
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: CU.submitBid }),
      ])
      .signers([bidder])
      .rpc();
    return { signature: sig };
  }

  async withdrawBid(p: WithdrawBidParams, bidder: Keypair): Promise<TxResult> {
    const cfg = await this.fetchConfig();
    const usdcMint: PublicKey = cfg.usdcMint;

    const bid = this.bidPda(p.listing, bidder.publicKey);
    const bidVault = getAssociatedTokenAddressSync(usdcMint, bid, true);
    const bidderUsdcAta = getAssociatedTokenAddressSync(usdcMint, bidder.publicKey);

    // listing이 살아 있으면 패스, 없으면 null
    let listing: PublicKey | null = p.listing;
    try {
      await this.fetchListing(p.listing);
    } catch {
      listing = null;
    }

    const sig = await this.program.methods
      .withdrawBid()
      .accounts({
        bidder: bidder.publicKey,
        bid,
        listing,
        bidVault,
        bidderUsdcAccount: bidderUsdcAta,
        config: this.configPda(),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: CU.withdrawBid }),
      ])
      .signers([bidder])
      .rpc();
    return { signature: sig };
  }

  // ── Permissionless ──────────────────────────────────────────────

  async claimExpired(p: ClaimExpiredParams, caller: Keypair): Promise<TxResult> {
    const listingAcc = await this.fetchListing(p.listing);
    const tokenMint: PublicKey = listingAcc.tokenMint;
    const maker: PublicKey = listingAcc.maker;

    const listingTokenAta = getAssociatedTokenAddressSync(tokenMint, p.listing, true);
    const makerTokenAta = getAssociatedTokenAddressSync(tokenMint, maker);

    const ixs: TransactionInstruction[] = [
      createAssociatedTokenAccountIdempotentInstruction(
        caller.publicKey,
        makerTokenAta,
        maker,
        tokenMint
      ),
      ComputeBudgetProgram.setComputeUnitLimit({ units: CU.claimExpired }),
    ];

    const sig = await this.program.methods
      .claimExpired()
      .accounts({
        caller: caller.publicKey,
        maker,
        listing: p.listing,
        tokenMint,
        streamflowMetadata: listingAcc.streamflowMetadata,
        listingTokenAta,
        makerTokenAta,
        config: this.configPda(),
        streamflowProgram: this.streamflowProgramId,
        rent: SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions(ixs)
      .signers([caller])
      .rpc();
    return { signature: sig };
  }
}
