/**
 * LOCK N ROLL v1 — localnet end-to-end 통합 테스트.
 *
 * 전제: solana-test-validator가 떠 있고 Anchor.toml의 clone들이 적용된 상태.
 *   - Streamflow program HqDGZj... clone
 *   - partner registry / treasury / Withdrawor partner 등 clone
 *
 * Streamflow contract 생성은 @streamflow/stream SDK 사용.
 * USDC는 mock SPL mint로 대체 (config.usdc_mint).
 *
 * 시나리오:
 *   1) buy_now flow — asking 매수 → 정산 검증
 *   2) submit_bid + accept_bid flow → 정산 검증
 *   3) cancel_listing — recipient 환원 검증
 *   4) submit_bid + withdraw_bid — vault 환불 검증
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LockNRoll } from "../target/types/lock_n_roll";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { ICluster } from "@streamflow/common";
import { SolanaStreamClient } from "@streamflow/stream/solana";
import { assert } from "chai";
import BN from "bn.js";

import { LockNRollClient } from "../sdk/client";
import { computeTotalUsdcRaw, computeFeeCeil } from "../sdk/pricing";

const STREAMFLOW_PROGRAM = new PublicKey(
  "HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ"
);
const FEE_BPS = 50; // 0.50%
const STREAMFLOW_VERSION = 4;
const TOKEN_DECIMALS = 6;
const VESTING_AMOUNT_RAW = 100_000_000n; // 100 token (decimals=6)
const PRICE_PER_TOKEN_MICRO_USDC = 500_000n; // 0.5 USDC/token → bid total = 50 USDC
const ASKING_PRICE_MICRO_USDC = 700_000n; // 0.7 USDC/token → buy_now total = 70 USDC

// 만료 정책: program이 [now+3600, unlock_at] 범위만 허용.
// cliff을 now + 2h, expires_at을 now + 1h + 30m 으로 설정해 충분한 마진.
const CLIFF_OFFSET_SEC = 2 * 3600;
const EXPIRES_OFFSET_SEC = 3600 + 1800;

async function airdrop(
  conn: anchor.web3.Connection,
  pk: PublicKey,
  sol: number
) {
  const sig = await conn.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, "confirmed");
}

async function createStream(
  client: SolanaStreamClient,
  payer: Keypair,
  mint: PublicKey,
  recipient: PublicKey
): Promise<PublicKey> {
  const now = Math.floor(Date.now() / 1000);
  const cliff = now + CLIFF_OFFSET_SEC;
  const params: any = {
    recipient: recipient.toBase58(),
    tokenId: mint.toBase58(),
    start: now,
    amount: new BN(VESTING_AMOUNT_RAW.toString()),
    period: 1,
    cliff,
    cliffAmount: new BN(VESTING_AMOUNT_RAW.toString()),
    amountPerPeriod: new BN(VESTING_AMOUNT_RAW.toString()),
    name: "lnr-integration",
    canTopup: false,
    cancelableBySender: false,
    cancelableByRecipient: false,
    transferableBySender: false,
    transferableByRecipient: true,
    automaticWithdrawal: false,
    withdrawalFrequency: 0,
  };
  const { metadataId } = await client.create(params, { sender: payer as any });
  return new PublicKey(metadataId);
}

async function fundTokens(
  conn: any,
  authority: Keypair,
  mint: PublicKey,
  recipient: PublicKey,
  amount: bigint
) {
  const ata = await createAssociatedTokenAccount(
    conn,
    authority,
    mint,
    recipient
  );
  await mintTo(conn, authority, mint, ata, authority, amount);
  return ata;
}

describe("LOCK N ROLL v1 E2E (localnet + Streamflow clone)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.LockNRoll as Program<LockNRoll>;
  const sdk = new LockNRollClient(program as any, {
    streamflowProgramId: STREAMFLOW_PROGRAM,
  });

  const authority = (provider.wallet as anchor.Wallet).payer;
  const maker = Keypair.generate();
  const taker = Keypair.generate();
  const bidder = Keypair.generate();
  const feeRecipient = Keypair.generate();

  let usdcMint: PublicKey;
  let tokenMint: PublicKey;
  let streamflowClient: SolanaStreamClient;
  let feeRecipientUsdcAta: PublicKey;
  let bidderUsdcAta: PublicKey;
  let takerUsdcAta: PublicKey;

  before(async () => {
    streamflowClient = new SolanaStreamClient(
      provider.connection.rpcEndpoint,
      ICluster.Devnet,
      "confirmed"
    );

    for (const kp of [maker, taker, bidder, feeRecipient]) {
      await airdrop(provider.connection, kp.publicKey, 10);
    }

    const conn = provider.connection as any;
    usdcMint = await createMint(conn, authority, authority.publicKey, null, 6);
    tokenMint = await createMint(
      conn,
      authority,
      authority.publicKey,
      null,
      TOKEN_DECIMALS
    );

    bidderUsdcAta = await fundTokens(
      conn,
      authority,
      usdcMint,
      bidder.publicKey,
      100_000_000_000n
    );
    takerUsdcAta = await fundTokens(
      conn,
      authority,
      usdcMint,
      taker.publicKey,
      100_000_000_000n
    );
    feeRecipientUsdcAta = await createAssociatedTokenAccount(
      conn,
      authority,
      usdcMint,
      feeRecipient.publicKey
    );

    try {
      await sdk.initConfig(
        {
          usdcMint,
          feeRecipient: feeRecipient.publicKey,
          feeBps: FEE_BPS,
          expectedStreamflowVersion: STREAMFLOW_VERSION,
        },
        authority
      );
    } catch (_e) {
      const cfg = await sdk.fetchConfig();
      if (
        cfg.usdcMint.toBase58() !== usdcMint.toBase58() ||
        cfg.feeRecipient.toBase58() !== feeRecipient.publicKey.toBase58() ||
        cfg.feeBps !== FEE_BPS ||
        cfg.expectedStreamflowVersion !== STREAMFLOW_VERSION
      ) {
        await program.methods
          .updateConfig(
            null,
            feeRecipient.publicKey,
            FEE_BPS,
            STREAMFLOW_VERSION,
            usdcMint
          )
          .accountsPartial({
            authority: authority.publicKey,
            config: sdk.configPda(),
          })
          .rpc();
      }
    }

    const cfg = await sdk.fetchConfig();
    assert.equal(cfg.usdcMint.toBase58(), usdcMint.toBase58());
    assert.equal(cfg.feeRecipient.toBase58(), feeRecipient.publicKey.toBase58());
    assert.equal(cfg.feeBps, FEE_BPS);

    console.log("usdc_mint:    ", usdcMint.toBase58());
    console.log("token_mint:   ", tokenMint.toBase58());
    console.log("maker:        ", maker.publicKey.toBase58());
    console.log("taker:        ", taker.publicKey.toBase58());
    console.log("bidder:       ", bidder.publicKey.toBase58());
    console.log("fee_recipient:", feeRecipient.publicKey.toBase58());
  });

  // ── Scenario 1: buy_now ─────────────────────────────────────────
  describe("Scenario 1: buy_now (asking 즉시 매수)", () => {
    let streamId: PublicKey;
    let listing: PublicKey;

    it("Streamflow contract 생성 (recipient = maker)", async () => {
      streamId = await createStream(
        streamflowClient,
        maker,
        tokenMint,
        maker.publicKey
      );
      const s = await streamflowClient.getOne({ id: streamId.toBase58() });
      assert.equal(String(s.recipient), maker.publicKey.toBase58());
    });

    it("create_listing: recipient → listing_pda 이전", async () => {
      const expiresAt = new Date(
        (Math.floor(Date.now() / 1000) + EXPIRES_OFFSET_SEC) * 1000
      );
      const res = await sdk.createListing(
        {
          streamflowMetadata: streamId,
          tokenMint,
          askingPriceMicroUsdc: ASKING_PRICE_MICRO_USDC,
          expiresAt,
        },
        maker
      );
      listing = res.listing;
      const lst = await sdk.fetchListing(listing);
      assert.equal(lst.maker.toBase58(), maker.publicKey.toBase58());
      assert.equal(lst.streamflowMetadata.toBase58(), streamId.toBase58());
      assert.equal(lst.vestingAmountRaw.toString(), VESTING_AMOUNT_RAW.toString());
      // recipient가 listing_pda로 이전됐는지
      const s = await streamflowClient.getOne({ id: streamId.toBase58() });
      assert.equal(String(s.recipient), listing.toBase58());
    });

    it("buy_now: USDC 정산 + recipient → taker", async () => {
      const total = computeTotalUsdcRaw(
        ASKING_PRICE_MICRO_USDC,
        VESTING_AMOUNT_RAW,
        TOKEN_DECIMALS
      );
      const expectedFee = computeFeeCeil(total, FEE_BPS);

      const balBefore = {
        taker: BigInt(
          (await getAccount(provider.connection, takerUsdcAta)).amount.toString()
        ),
        feeRcpt: BigInt(
          (await getAccount(provider.connection, feeRecipientUsdcAta)).amount.toString()
        ),
      };

      await sdk.buyNow({ listing }, taker);

      const makerUsdcAta = getAssociatedTokenAddressSync(
        usdcMint,
        maker.publicKey
      );
      const balAfter = {
        taker: BigInt(
          (await getAccount(provider.connection, takerUsdcAta)).amount.toString()
        ),
        maker: BigInt(
          (await getAccount(provider.connection, makerUsdcAta)).amount.toString()
        ),
        feeRcpt: BigInt(
          (await getAccount(provider.connection, feeRecipientUsdcAta)).amount.toString()
        ),
      };

      assert.equal(balAfter.maker.toString(), total.toString(), "maker = total");
      assert.equal(
        (balBefore.feeRcpt + BigInt(expectedFee.toString())).toString(),
        balAfter.feeRcpt.toString(),
        "fee_recipient += fee"
      );
      assert.equal(
        (balBefore.taker - BigInt(total.toString()) - BigInt(expectedFee.toString())).toString(),
        balAfter.taker.toString(),
        "taker -= (total + fee)"
      );

      // recipient → taker
      const s = await streamflowClient.getOne({ id: streamId.toBase58() });
      assert.equal(String(s.recipient), taker.publicKey.toBase58());

      // listing.status = Settled
      const lst = await sdk.fetchListing(listing);
      assert.deepEqual(lst.status, { settled: {} });
    });
  });

  // ── Scenario 2: accept_bid ──────────────────────────────────────
  describe("Scenario 2: submit_bid + accept_bid", () => {
    let streamId: PublicKey;
    let listing: PublicKey;
    let total: BN;
    let expectedFee: BN;

    it("새 stream + listing 준비", async () => {
      streamId = await createStream(
        streamflowClient,
        maker,
        tokenMint,
        maker.publicKey
      );
      const expiresAt = new Date(
        (Math.floor(Date.now() / 1000) + EXPIRES_OFFSET_SEC) * 1000
      );
      const res = await sdk.createListing(
        {
          streamflowMetadata: streamId,
          tokenMint,
          // bid-only
          expiresAt,
        },
        maker
      );
      listing = res.listing;
    });

    it("submit_bid: vault 적립", async () => {
      total = computeTotalUsdcRaw(
        PRICE_PER_TOKEN_MICRO_USDC,
        VESTING_AMOUNT_RAW,
        TOKEN_DECIMALS
      );
      expectedFee = computeFeeCeil(total, FEE_BPS);

      const balBefore = BigInt(
        (await getAccount(provider.connection, bidderUsdcAta)).amount.toString()
      );

      await sdk.submitBid(
        {
          listing,
          pricePerTokenMicroUsdc: PRICE_PER_TOKEN_MICRO_USDC,
        },
        bidder
      );

      const balAfter = BigInt(
        (await getAccount(provider.connection, bidderUsdcAta)).amount.toString()
      );
      assert.equal(
        (balBefore - balAfter).toString(),
        total.toString(),
        "bidder -= total"
      );

      const bid = await sdk.fetchBid(sdk.bidPda(listing, bidder.publicKey));
      assert.equal(bid.totalUsdcRaw.toString(), total.toString());
      assert.deepEqual(bid.status, { open: {} });

      const lst = await sdk.fetchListing(listing);
      assert.equal(lst.bidCount, 1);
    });

    it("accept_bid: maker 수령 + recipient → bidder + vault close", async () => {
      const bid = sdk.bidPda(listing, bidder.publicKey);
      const bidVault = getAssociatedTokenAddressSync(usdcMint, bid, true);
      const makerUsdcAta = getAssociatedTokenAddressSync(
        usdcMint,
        maker.publicKey
      );

      const feeBefore = BigInt(
        (await getAccount(provider.connection, feeRecipientUsdcAta)).amount.toString()
      );

      await sdk.acceptBid(
        { listing, bidder: bidder.publicKey },
        maker
      );

      const makerBal = BigInt(
        (await getAccount(provider.connection, makerUsdcAta)).amount.toString()
      );
      // 매도자 부담: maker가 (total - fee) 수령
      assert.equal(
        makerBal.toString(),
        (BigInt(total.toString()) - BigInt(expectedFee.toString())).toString(),
        "maker = total - fee"
      );

      const feeAfter = BigInt(
        (await getAccount(provider.connection, feeRecipientUsdcAta)).amount.toString()
      );
      assert.equal(
        (feeAfter - feeBefore).toString(),
        expectedFee.toString(),
        "fee_recipient += fee"
      );

      // vault closed
      try {
        await getAccount(provider.connection, bidVault);
        assert.fail("vault must be closed");
      } catch {
        // expected
      }

      // bid status
      const bidAcc = await sdk.fetchBid(bid);
      assert.deepEqual(bidAcc.status, { accepted: {} });

      // recipient → bidder
      const s = await streamflowClient.getOne({ id: streamId.toBase58() });
      assert.equal(String(s.recipient), bidder.publicKey.toBase58());

      // listing.status = Settled
      const lst = await sdk.fetchListing(listing);
      assert.deepEqual(lst.status, { settled: {} });
    });
  });

  // ── Scenario 3: cancel_listing ──────────────────────────────────
  describe("Scenario 3: cancel_listing", () => {
    let streamId: PublicKey;
    let listing: PublicKey;

    it("새 stream + listing 준비", async () => {
      streamId = await createStream(
        streamflowClient,
        maker,
        tokenMint,
        maker.publicKey
      );
      const expiresAt = new Date(
        (Math.floor(Date.now() / 1000) + EXPIRES_OFFSET_SEC) * 1000
      );
      const res = await sdk.createListing(
        {
          streamflowMetadata: streamId,
          tokenMint,
          askingPriceMicroUsdc: ASKING_PRICE_MICRO_USDC,
          expiresAt,
        },
        maker
      );
      listing = res.listing;
    });

    it("cancel_listing: recipient → maker 환원", async () => {
      await sdk.cancelListing({ listing }, maker);
      const s = await streamflowClient.getOne({ id: streamId.toBase58() });
      assert.equal(String(s.recipient), maker.publicKey.toBase58());
      const lst = await sdk.fetchListing(listing);
      assert.deepEqual(lst.status, { cancelled: {} });
    });
  });

  // ── Scenario 4: withdraw_bid ────────────────────────────────────
  describe("Scenario 4: submit_bid + withdraw_bid (환불)", () => {
    let streamId: PublicKey;
    let listing: PublicKey;

    it("새 stream + listing + bid 준비", async () => {
      streamId = await createStream(
        streamflowClient,
        maker,
        tokenMint,
        maker.publicKey
      );
      const expiresAt = new Date(
        (Math.floor(Date.now() / 1000) + EXPIRES_OFFSET_SEC) * 1000
      );
      const res = await sdk.createListing(
        {
          streamflowMetadata: streamId,
          tokenMint,
          expiresAt,
        },
        maker
      );
      listing = res.listing;
      await sdk.submitBid(
        { listing, pricePerTokenMicroUsdc: PRICE_PER_TOKEN_MICRO_USDC },
        bidder
      );
    });

    it("withdraw_bid: vault USDC → bidder 환불 + listing.bid_count--", async () => {
      const total = computeTotalUsdcRaw(
        PRICE_PER_TOKEN_MICRO_USDC,
        VESTING_AMOUNT_RAW,
        TOKEN_DECIMALS
      );

      const before = BigInt(
        (await getAccount(provider.connection, bidderUsdcAta)).amount.toString()
      );
      await sdk.withdrawBid({ listing }, bidder);
      const after = BigInt(
        (await getAccount(provider.connection, bidderUsdcAta)).amount.toString()
      );
      assert.equal(
        (after - before).toString(),
        total.toString(),
        "bidder += total"
      );

      const bid = await sdk.fetchBid(sdk.bidPda(listing, bidder.publicKey));
      assert.deepEqual(bid.status, { withdrawn: {} });

      const lst = await sdk.fetchListing(listing);
      assert.equal(lst.bidCount, 0);
    });
  });
});
