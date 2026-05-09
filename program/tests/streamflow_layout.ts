/**
 * Streamflow Contract layout 검증.
 * 우리 Rust struct StreamflowContractHeader가 실제 devnet의 contract account
 * raw bytes와 정확히 일치하는지 byte 단위로 확인 + EXPECTED_STREAMFLOW_VERSION 확정.
 */
import * as anchor from "@coral-xyz/anchor";
import { ICluster } from "@streamflow/common";
import { SolanaStreamClient } from "@streamflow/stream/solana";
import { assert } from "chai";

// spike test에서 만든 devnet contract
const STREAM_ID = new anchor.web3.PublicKey(
  "pGWrTbLjt7NKDzawaQrj9WRM1eQ6LMYUN5Dvj8gVeo5"
);
const STREAMFLOW_PROGRAM = new anchor.web3.PublicKey(
  "HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ"
);

describe("Streamflow Contract layout 검증", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  it("우리 layout이 실제 contract bytes와 일치 + version 확정", async () => {
    // 1. SDK getOne (표준 deserialize)
    const client = new SolanaStreamClient(
      provider.connection.rpcEndpoint,
      ICluster.Devnet,
      "confirmed"
    );
    const sdk = await client.getOne({ id: STREAM_ID.toBase58() });

    // 2. raw bytes
    const acc = await provider.connection.getAccountInfo(STREAM_ID);
    if (!acc) throw new Error("contract account 없음");
    assert.equal(
      acc.owner.toBase58(),
      STREAMFLOW_PROGRAM.toBase58(),
      "Streamflow program이 소유"
    );
    const d = acc.data;

    // 3. 우리 Rust StreamflowContractHeader 그대로 따라 수동 decode
    let o = 0;
    const u64 = (): bigint => {
      const v = d.readBigUInt64LE(o);
      o += 8;
      return v;
    };
    const u8 = (): number => {
      const v = d.readUInt8(o);
      o += 1;
      return v;
    };
    const f32 = (): number => {
      const v = d.readFloatLE(o);
      o += 4;
      return v;
    };
    const pk = (): anchor.web3.PublicKey => {
      const v = new anchor.web3.PublicKey(d.subarray(o, o + 32));
      o += 32;
      return v;
    };

    const magic = u64();
    const version = u8();
    const created_at = u64();
    const amount_withdrawn = u64();
    const canceled_at = u64();
    const end_time = u64();
    const last_withdrawn_at = u64();

    const sender = pk();
    const sender_tokens = pk();
    const recipient = pk();
    const recipient_tokens = pk();
    const mint = pk();
    const escrow_tokens = pk();
    const streamflow_treasury = pk();
    const streamflow_treasury_tokens = pk();

    const streamflow_fee_total = u64();
    const streamflow_fee_withdrawn = u64();
    const streamflow_fee_percent = f32();

    const partner = pk();
    const partner_tokens = pk();
    const partner_fee_total = u64();
    const partner_fee_withdrawn = u64();
    const partner_fee_percent = f32();

    // ix: CreateParams
    const start_time = u64();
    const net_amount_deposited = u64();
    const period = u64();
    const amount_per_period = u64();
    const cliff = u64();
    const cliff_amount = u64();
    const cancelable_by_sender = u8();
    const cancelable_by_recipient = u8();
    const automatic_withdrawal = u8();
    const transferable_by_sender = u8();
    const transferable_by_recipient = u8();
    const can_topup = u8();
    const stream_name = d.subarray(o, o + 64);
    o += 64;
    const withdraw_frequency = u64();

    console.log("\n=== 수동 decode 결과 ===");
    console.log("offset consumed:", o, "/ total bytes:", d.length);
    console.log("magic:        0x" + magic.toString(16));
    console.log("version:      ", version);
    console.log("recipient:    ", recipient.toBase58());
    console.log("mint:         ", mint.toBase58());
    console.log("end_time:     ", end_time.toString());
    console.log("net_amount_deposited:", net_amount_deposited.toString());
    console.log("amount_withdrawn:    ", amount_withdrawn.toString());
    console.log("transferable_by_recipient:", transferable_by_recipient);
    console.log("cancelable_by_sender:    ", cancelable_by_sender);
    console.log("transferable_by_sender:  ", transferable_by_sender);
    console.log("cancelable_by_recipient: ", cancelable_by_recipient);
    console.log("can_topup:               ", can_topup);
    console.log("automatic_withdrawal:    ", automatic_withdrawal);

    // 4. SDK 결과와 cross-check
    console.log("\n=== SDK 비교 ===");
    console.log("SDK recipient:", String(sdk.recipient));
    console.log("SDK mint:     ", String(sdk.mint));
    console.log("SDK end:      ", String((sdk as any).end ?? (sdk as any).endTime));

    assert.equal(
      recipient.toBase58(),
      String(sdk.recipient),
      "recipient byte offset 정확"
    );
    assert.equal(mint.toBase58(), String(sdk.mint), "mint byte offset 정확");

    // 5. v1 eligibility 자격 검증 (spec §2.3 가드 boolean들)
    assert.equal(transferable_by_recipient, 1, "tradable contract requirement: transferable_by_recipient=true");
    assert.equal(cancelable_by_sender, 0, "tradable contract requirement: cancelable_by_sender=false");
    assert.equal(transferable_by_sender, 0, "marketplace policy: transferable_by_sender=false");
    assert.equal(cancelable_by_recipient, 0, "marketplace policy: cancelable_by_recipient=false");
    assert.equal(can_topup, 0, "marketplace policy: can_topup=false");
    assert.equal(automatic_withdrawal, 0, "marketplace policy: automatic_withdrawal=false");

    console.log("\n✅ EXPECTED_STREAMFLOW_VERSION =", version);
    console.log("→ program/programs/program/src/lib.rs의 const로 확정 가능");
  });
});
