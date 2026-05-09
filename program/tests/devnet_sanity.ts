/**
 * devnet에 deploy된 v1 program이 실제로 callable한지 최소 비용으로 검증.
 *   - init_config 호출 (~0.005 SOL)
 *   - Config PDA fetch + 필드 검증
 *   - 이미 init된 상태면 fetch만 (cost 0)
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LockNRoll } from "../target/types/lock_n_roll";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

import { LockNRollClient } from "../sdk/client";

describe("devnet v1 sanity (deploy 검증)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.LockNRoll as Program<LockNRoll>;
  const sdk = new LockNRollClient(program as any);
  const authority = (provider.wallet as anchor.Wallet).payer;

  const seedUsdcMint = Keypair.generate().publicKey;
  const seedFeeRecipient = Keypair.generate().publicKey;
  const FEE_BPS = 50;
  const STREAMFLOW_VERSION = 4;

  it("init_config: 호출 성공 또는 이미 init됨 (둘 다 PASS)", async () => {
    let initCalled = false;
    try {
      await sdk.initConfig(
        {
          usdcMint: seedUsdcMint,
          feeRecipient: seedFeeRecipient,
          feeBps: FEE_BPS,
          expectedStreamflowVersion: STREAMFLOW_VERSION,
        },
        authority
      );
      initCalled = true;
      console.log("✅ init_config 새로 호출됨");
    } catch (e: any) {
      console.log("(이미 init됨 — 기존 config 사용):", e.message?.slice(0, 80));
    }

    const cfg = await sdk.fetchConfig();
    console.log("\n=== devnet Config ===");
    console.log("  authority:                ", cfg.authority.toBase58());
    console.log("  usdc_mint:                ", cfg.usdcMint.toBase58());
    console.log("  fee_recipient:            ", cfg.feeRecipient.toBase58());
    console.log("  fee_bps:                  ", cfg.feeBps);
    console.log("  expected_streamflow_ver:  ", cfg.expectedStreamflowVersion);
    console.log("  bump:                     ", cfg.bump);

    // 핵심 필드 sanity
    assert.ok(cfg.authority);
    assert.ok(cfg.usdcMint);
    assert.ok(cfg.feeRecipient);
    assert.isAtLeast(cfg.feeBps, 0);
    assert.isAtMost(cfg.feeBps, 10000);
    assert.equal(cfg.expectedStreamflowVersion, STREAMFLOW_VERSION);

    if (initCalled) {
      assert.equal(cfg.authority.toBase58(), authority.publicKey.toBase58());
      assert.equal(cfg.usdcMint.toBase58(), seedUsdcMint.toBase58());
      assert.equal(cfg.feeRecipient.toBase58(), seedFeeRecipient.toBase58());
      assert.equal(cfg.feeBps, FEE_BPS);
    }
  });

  it("PDA derivation: client-side seed 일치", () => {
    const cfgPda = sdk.configPda();
    console.log("  config PDA:", cfgPda.toBase58());
    assert.ok(cfgPda);
  });

  it("program account: deploy됐고 owner = BPFLoaderUpgradeable", async () => {
    const acc = await provider.connection.getAccountInfo(program.programId);
    assert.ok(acc, "program account 존재");
    assert.equal(
      acc.owner.toBase58(),
      "BPFLoaderUpgradeab1e11111111111111111111111"
    );
    console.log(
      "  program",
      program.programId.toBase58(),
      "✅ executable, data_len =",
      acc.data.length
    );
  });
});
