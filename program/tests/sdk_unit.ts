/**
 * SDK 순수 helper 단위 테스트 (Streamflow/devnet 의존 없이).
 * computeTotalUsdcRaw / computeFeeCeil / PDA derivation 검증.
 */
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import BN from "bn.js";
import {
  computeTotalUsdcRaw,
  computeFeeCeil,
} from "../sdk/pricing";
import { configPda, listingPda, bidPda, nextListingNonce } from "../sdk/seeds";

const PROGRAM_ID = new PublicKey("58cA8UATTBpWDcv4HgddYVy1TLhKXs2EWYSqEbzR5pnp");

describe("SDK helpers", () => {
  describe("pricing", () => {
    it("computeTotalUsdcRaw: ceil 적용", () => {
      // 1 token = 0.5 USDC, 10_000 raw token (decimals=6 → 0.01 token)
      // total = 0.5_000_000 micro-USDC * 10_000 / 10^6 = 5_000 micro-USDC = 0.005 USDC
      const total = computeTotalUsdcRaw(500_000n, 10_000n, 6);
      assert.equal(total.toString(), "5000");
    });

    it("computeTotalUsdcRaw: 나머지 발생 시 ceil", () => {
      // price=1, amount=3, denom=10 → 3/10 = 0.3 → ceil → 1
      const total = computeTotalUsdcRaw(1n, 3n, 1);
      assert.equal(total.toString(), "1");
    });

    it("computeFeeCeil: 50 bps", () => {
      const fee = computeFeeCeil(new BN(8_000_000_000), 50);
      assert.equal(fee.toString(), "40000000"); // 0.5% of 8000 = 40 USDC raw
    });

    it("computeFeeCeil: 0 bps → 0", () => {
      assert.equal(computeFeeCeil(new BN(123_456), 0).toString(), "0");
    });

    it("computeFeeCeil: 나머지 발생 시 ceil", () => {
      // amount=1, bps=1 → 1*1 + 9999 = 10000 / 10000 = 1
      assert.equal(computeFeeCeil(new BN(1), 1).toString(), "1");
    });
  });

  describe("PDA seeds", () => {
    it("configPda: deterministic", () => {
      const [a] = configPda(PROGRAM_ID);
      const [b] = configPda(PROGRAM_ID);
      assert.equal(a.toBase58(), b.toBase58());
    });

    it("listingPda: 시드 변경 → 다른 PDA", () => {
      const maker = PublicKey.unique();
      const meta = PublicKey.unique();
      const [pdaA] = listingPda(PROGRAM_ID, maker, meta, 1n);
      const [pdaB] = listingPda(PROGRAM_ID, maker, meta, 2n);
      assert.notEqual(pdaA.toBase58(), pdaB.toBase58());
    });

    it("bidPda: (listing, bidder)에 의해 고유", () => {
      const listing = PublicKey.unique();
      const bidderA = PublicKey.unique();
      const bidderB = PublicKey.unique();
      const [pdaA] = bidPda(PROGRAM_ID, listing, bidderA);
      const [pdaB] = bidPda(PROGRAM_ID, listing, bidderB);
      assert.notEqual(pdaA.toBase58(), pdaB.toBase58());
    });
  });

  describe("nonce", () => {
    it("nextListingNonce: 64-bit random, 매번 다름", () => {
      const a = nextListingNonce();
      const b = nextListingNonce();
      assert.notEqual(a, b);
      assert.isTrue(a >= 0n && a <= 2n ** 64n - 1n);
    });
  });
});
