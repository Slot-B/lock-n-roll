/**
 * B0 Streamflow CPI spike.
 * 증명할 단 하나: spike program의 PDA가 invoke_signed로 Streamflow Transfer
 * instruction의 authority를 통과하는가.
 *
 * 환경: anchor.toml의 [test.validator] 설정으로 localnet에 Streamflow devnet
 * 바이너리를 clone해서 실행. 또는 ANCHOR_PROVIDER_URL=devnet 으로 직접 실행.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Spike } from "../target/types/spike";
import {
  createMint,
  createAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { ICluster } from "@streamflow/common";
import { SolanaStreamClient } from "@streamflow/stream/solana";
import { assert } from "chai";
import BN from "bn.js";

const STREAMFLOW_DEVNET_PROGRAM = new anchor.web3.PublicKey(
  "HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ"
);

describe("B0 Streamflow CPI spike", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Spike as Program<Spike>;

  const payer = (provider.wallet as anchor.Wallet).payer;
  const newRecipient = anchor.web3.Keypair.generate();

  let mint: anchor.web3.PublicKey;
  let makerTokenAcc: anchor.web3.PublicKey;
  let listingPda: anchor.web3.PublicKey;
  let streamId: anchor.web3.PublicKey;
  let streamflowClient: SolanaStreamClient;

  before(async () => {
    // localnet에서는 무한 airdrop 가능
    for (const kp of [payer, newRecipient]) {
      try {
        const sig = await provider.connection.requestAirdrop(
          kp.publicKey,
          10 * anchor.web3.LAMPORTS_PER_SOL
        );
        await provider.connection.confirmTransaction(sig);
      } catch {}
    }

    const conn = provider.connection as any;
    // 테스트 토큰 mint 발행
    mint = await createMint(conn, payer, payer.publicKey, null, 6);
    makerTokenAcc = await createAccount(conn, payer, mint, payer.publicKey);
    await mintTo(conn, payer, mint, makerTokenAcc, payer, 1_000_000_000);

    // listing PDA 유도
    [listingPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("spike"), payer.publicKey.toBuffer()],
      program.programId
    );

    // Streamflow client 초기화
    streamflowClient = new SolanaStreamClient(
      provider.connection.rpcEndpoint,
      ICluster.Devnet, // localnet+clone에서도 Devnet program ID 사용
      "confirmed"
    );

    console.log("payer (maker):", payer.publicKey.toBase58());
    console.log("listing_pda:  ", listingPda.toBase58());
    console.log("new_recipient:", newRecipient.publicKey.toBase58());
    console.log("mint:         ", mint.toBase58());
  });

  it("Streamflow vesting contract 생성", async () => {
    // unlock_at = now + 60초, transferable_by_recipient = true,
    // cancelable_by_sender = false 등 v1 자격 충족
    const now = Math.floor(Date.now() / 1000);
    const cliff = now + 60;

    const createParams: any = {
      recipient: payer.publicKey.toBase58(),
      tokenId: mint.toBase58(),
      start: now,
      amount: new BN(100_000_000),
      period: 1,
      cliff,
      cliffAmount: new BN(100_000_000),
      amountPerPeriod: new BN(100_000_000),
      name: "B0 spike vesting",
      canTopup: false,
      cancelableBySender: false,
      cancelableByRecipient: false,
      transferableBySender: false,
      transferableByRecipient: true,
      automaticWithdrawal: false,
      withdrawalFrequency: 0,
    };

    const { txId, metadataId } = await streamflowClient.create(createParams, {
      sender: payer as any,
    });

    streamId = new anchor.web3.PublicKey(metadataId);
    console.log("✅ Streamflow contract:", streamId.toBase58(), "tx:", txId);
  });

  it("recipient를 maker → listing_pda로 transfer (maker 서명)", async () => {
    // listing_pda 가 recipient가 되려면 (mint, listing_pda)의 ATA가 필요
    const listingAta = getAssociatedTokenAddressSync(
      mint,
      listingPda,
      true // allowOwnerOffCurve = true (PDA이므로)
    );

    // ATA 미리 생성
    const ataIx = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      listingAta,
      listingPda,
      mint
    );
    const tx = new anchor.web3.Transaction().add(ataIx);
    await provider.sendAndConfirm(tx, [payer]);

    // Streamflow SDK로 recipient transfer (maker 서명)
    const transferRes = await streamflowClient.transfer(
      {
        id: streamId.toBase58(),
        newRecipient: listingPda.toBase58(),
      },
      { invoker: payer as any }
    );
    console.log("✅ recipient → listing_pda, tx:", transferRes.txId);

    // SDK가 보낸 instruction의 raw discriminator를 추출 (B0 검증용)
    const fullTx = await provider.connection.getTransaction(transferRes.txId, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (fullTx) {
      const msg = fullTx.transaction.message;
      const ixs = "instructions" in msg ? msg.instructions : [];
      for (const ix of ixs) {
        const programIdx = (ix as any).programIdIndex;
        const keys = (msg as any).accountKeys ?? (msg as any).staticAccountKeys;
        const programId = keys[programIdx]?.toBase58?.() ?? keys[programIdx];
        if (programId === STREAMFLOW_DEVNET_PROGRAM.toBase58()) {
          const dataStr = (ix as any).data;
          // anchor's getTransaction returns base58 encoded data
          const bs58 = require("bs58");
          const raw = bs58.decode(dataStr);
          console.log(
            "🔍 Streamflow transfer ix discriminator (first 8 bytes):",
            Array.from(raw.slice(0, 8))
              .map((b) => (b as number).toString(16).padStart(2, "0"))
              .join(" ")
          );
        }
      }
    }
  });

  it("⭐ B0: spike PDA가 invoke_signed로 Streamflow Transfer 통과", async () => {
    // new_recipient의 ATA 미리 생성 (Streamflow가 자동 생성한다고 가정 안 함)
    const newRecipientAta = getAssociatedTokenAddressSync(
      mint,
      newRecipient.publicKey
    );
    const ataIx = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      newRecipientAta,
      newRecipient.publicKey,
      mint
    );
    const setupTx = new anchor.web3.Transaction().add(ataIx);
    await provider.sendAndConfirm(setupTx, [payer]);

    // 우리 spike program 호출 (ix_data 빈 배열 → program의 정적 fallback 사용)
    const sig = await program.methods
      .proveTransfer(Buffer.from([]))
      .accounts({
        maker: payer.publicKey,
        listingPda,
        newRecipient: newRecipient.publicKey,
        newRecipientTokens: newRecipientAta,
        metadata: streamId,
        mint,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        streamflowProgram: STREAMFLOW_DEVNET_PROGRAM,
      } as any)
      .rpc({ commitment: "confirmed" });

    console.log("🎉 B0 SUCCESS — tx:", sig);

    // Streamflow contract 다시 fetch해서 recipient 확인
    const stream = await streamflowClient.getOne({ id: streamId.toBase58() });
    console.log("contract.recipient now:", stream.recipient);
    assert.equal(
      stream.recipient,
      newRecipient.publicKey.toBase58(),
      "recipient must be new_recipient after PDA-signed transfer"
    );
  });
});
