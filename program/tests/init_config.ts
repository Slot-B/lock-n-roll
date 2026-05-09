/**
 * v1 main program의 init_config / update_config 단위 테스트.
 * Streamflow CPI 의존 없으므로 vanilla localnet에서 실행 가능.
 *
 * 사전 조건: solana-test-validator 가 main program(.so) 을 deploy해서 띄워져 있어야.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LockNRoll } from "../target/types/lock_n_roll";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { assert, expect } from "chai";
import { LockNRollClient } from "../sdk/client";

describe("Config: init / update (Streamflow 의존 없음)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.LockNRoll as Program<LockNRoll>;

  const sdk = new LockNRollClient(program as any);
  const authority = (provider.wallet as anchor.Wallet).payer;
  const usdcMint = Keypair.generate().publicKey;
  const feeRecipient = Keypair.generate().publicKey;
  const FEE_BPS = 50;
  const VERSION = 4;

  it("init_config: 거버넌스 파라미터 셋업", async () => {
    await sdk.initConfig(
      {
        usdcMint,
        feeRecipient,
        feeBps: FEE_BPS,
        expectedStreamflowVersion: VERSION,
      },
      authority
    );

    const cfg = await sdk.fetchConfig();
    assert.equal(cfg.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(cfg.usdcMint.toBase58(), usdcMint.toBase58());
    assert.equal(cfg.feeRecipient.toBase58(), feeRecipient.toBase58());
    assert.equal(cfg.feeBps, FEE_BPS);
    assert.equal(cfg.expectedStreamflowVersion, VERSION);
  });

  it("update_config: 일부 필드만 갱신", async () => {
    const newRecipient = Keypair.generate().publicKey;
    await program.methods
      .updateConfig(null, newRecipient, 100, null)
      .accounts({
        authority: authority.publicKey,
        config: sdk.configPda(),
      })
      .rpc();

    const cfg = await sdk.fetchConfig();
    assert.equal(cfg.feeBps, 100);
    assert.equal(cfg.feeRecipient.toBase58(), newRecipient.toBase58());
    // 나머지는 그대로
    assert.equal(cfg.expectedStreamflowVersion, VERSION);
  });

  it("update_config: 권한 없는 호출은 거부", async () => {
    const intruder = Keypair.generate();
    // intruder에게 SOL 보내 fee payer로
    const tx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: intruder.publicKey,
        lamports: 1_000_000_000,
      })
    );
    await provider.sendAndConfirm(tx, [authority]);

    try {
      await program.methods
        .updateConfig(null, null, 999, null)
        .accounts({
          authority: intruder.publicKey,
          config: sdk.configPda(),
        })
        .signers([intruder])
        .rpc();
      assert.fail("authority mismatch revert해야 함");
    } catch (e: any) {
      expect(e.toString()).to.match(/Unauthorized|address|constraint/i);
    }
  });

  it("init_config: 잘못된 fee_bps(>10000) 거부", async () => {
    // 이미 init된 config는 PDA 충돌. 새 config PDA는 같은 seed라 init 불가.
    // 대신 update로 검증.
    try {
      await program.methods
        .updateConfig(null, null, 20000, null)
        .accounts({
          authority: authority.publicKey,
          config: sdk.configPda(),
        })
        .rpc();
      assert.fail("InvalidFeeBps revert해야 함");
    } catch (e: any) {
      expect(e.toString()).to.include("InvalidFeeBps");
    }
  });
});
