import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db/client.js";
import { ingestEvents } from "../src/indexer/pipeline.js";
import type { EventEnvelope } from "../src/indexer/eventSchemas.js";

const M1 = "TestMaker11111111111111111111111111111111";
const T1 = "TestTaker11111111111111111111111111111111";
const B1 = "TestBidder1111111111111111111111111111111";
const TOK = "TestToken11111111111111111111111111111111";

const SM_A = "TestStream1111111111111111111111111111111";
const SM_B = "TestStream2222222222222222222222222222222";
const SM_C = "TestStream3333333333333333333333333333333";
const SM_D = "TestStream4444444444444444444444444444444";

const L_A = "TestListing111111111111111111111111111111";
const L_B = "TestListing222222222222222222222222222222";
const L_C = "TestListing333333333333333333333333333333";
const L_D = "TestListing444444444444444444444444444444";

const BID_A = "TestBid1111111111111111111111111111111111";
const BID_B = "TestBid2222222222222222222222222222222222";

const txSig = (n: number) =>
  `Tx${String(n).padStart(7, "0")}` + "x".repeat(64 - 9);

const expiresIn = (sec: number) => Math.floor(Date.now() / 1000) + sec;
const unlockIn = (sec: number) => Math.floor(Date.now() / 1000) + sec;

const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
const expect = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};

async function clean() {
  await db.delete(schema.bids);
  await db.delete(schema.tradeHistory);
  await db.delete(schema.processedEvents);
  await db.delete(schema.orders);
  await db.delete(schema.users);
}

async function main() {
  await clean();

  // ----- Scenario A: listing → bid → buy_now (asking mode) -----
  await ingestEvents([
    {
      tx_signature: txSig(1),
      event_index: 0,
      slot: 1000,
      name: "ListingCreated",
      payload: {
        listing_pda: L_A,
        maker: M1,
        streamflow_metadata: SM_A,
        token_mint: TOK,
        token_decimals: 6,
        vesting_amount_raw: "1000000000",
        asking_price_micro_usdc: "12000",
        expires_at: expiresIn(7 * 86400),
        unlock_at: unlockIn(30 * 86400),
      },
    },
  ]);

  let order = (await db.select().from(schema.orders).where(eq(schema.orders.listingPda, L_A)))[0];
  expect("A1: ListingCreated → order LISTED", order?.status === "LISTED", `status=${order?.status}`);
  expect("A1: bidCount = 0", order?.bidCount === 0);

  await ingestEvents([
    {
      tx_signature: txSig(2),
      event_index: 0,
      slot: 1100,
      name: "BidSubmitted",
      payload: {
        bid_pda: BID_A,
        listing_pda: L_A,
        bidder: B1,
        price_per_token_micro_usdc: "10000",
        total_usdc_raw: "10000000000",
      },
    },
  ]);

  order = (await db.select().from(schema.orders).where(eq(schema.orders.listingPda, L_A)))[0];
  expect("A2: BidSubmitted → bid_count=1", order?.bidCount === 1, `count=${order?.bidCount}`);
  expect("A2: best_bid recomputed", order?.bestBidPriceMicroUsdc === "10000", `best=${order?.bestBidPriceMicroUsdc}`);

  await ingestEvents([
    {
      tx_signature: txSig(3),
      event_index: 0,
      slot: 1200,
      name: "OrderTaken",
      payload: {
        listing_pda: L_A,
        streamflow_metadata: SM_A,
        maker: M1,
        taker: T1,
        token_mint: TOK,
        vesting_amount_raw: "1000000000",
        price_per_token_micro_usdc: "12000",
        total_usdc_raw: "12000000000",
        market_price_micro_usdc: "20000",
        mode: "asking",
        accepted_bid_pda: null,
        swept_token_amount: "0",
      },
    },
  ]);

  order = (await db.select().from(schema.orders).where(eq(schema.orders.listingPda, L_A)))[0];
  expect("A3: OrderTaken → SETTLED", order?.status === "SETTLED");
  expect("A3: swept = 0", order?.sweptTokenAmount === "0");

  const bid = (await db.select().from(schema.bids).where(eq(schema.bids.bidPda, BID_A)))[0];
  expect("A3: losing bid stays OPEN (refund manual)", bid?.status === "OPEN");

  const trades = await db.select().from(schema.tradeHistory).where(eq(schema.tradeHistory.listingPda, L_A));
  expect("A3: trade_history row inserted", trades.length === 1);
  expect("A3: discount_rate computed", trades[0]?.discountRate !== null);

  // ----- Scenario B: bid-only → accept_bid (bid mode) -----
  await ingestEvents([
    {
      tx_signature: txSig(4),
      event_index: 0,
      slot: 2000,
      name: "ListingCreated",
      payload: {
        listing_pda: L_B,
        maker: M1,
        streamflow_metadata: SM_B,
        token_mint: TOK,
        token_decimals: 6,
        vesting_amount_raw: "500000000",
        asking_price_micro_usdc: null,
        expires_at: expiresIn(7 * 86400),
        unlock_at: unlockIn(30 * 86400),
      },
    },
    {
      tx_signature: txSig(5),
      event_index: 0,
      slot: 2100,
      name: "BidSubmitted",
      payload: {
        bid_pda: BID_B,
        listing_pda: L_B,
        bidder: B1,
        price_per_token_micro_usdc: "8500",
        total_usdc_raw: "4250000000",
      },
    },
    {
      tx_signature: txSig(6),
      event_index: 0,
      slot: 2200,
      name: "OrderTaken",
      payload: {
        listing_pda: L_B,
        streamflow_metadata: SM_B,
        maker: M1,
        taker: B1,
        token_mint: TOK,
        vesting_amount_raw: "500000000",
        price_per_token_micro_usdc: "8500",
        total_usdc_raw: "4250000000",
        market_price_micro_usdc: null,
        mode: "bid",
        accepted_bid_pda: BID_B,
        swept_token_amount: "0",
      },
    },
  ]);

  const orderB = (await db.select().from(schema.orders).where(eq(schema.orders.listingPda, L_B)))[0];
  expect("B: bid-only → SETTLED via bid mode", orderB?.status === "SETTLED");
  const bidB = (await db.select().from(schema.bids).where(eq(schema.bids.bidPda, BID_B)))[0];
  expect("B: accepted bid → ACCEPTED", bidB?.status === "ACCEPTED");

  // ----- Scenario C: cancel + bid_withdrawn -----
  await ingestEvents([
    {
      tx_signature: txSig(7),
      event_index: 0,
      slot: 3000,
      name: "ListingCreated",
      payload: {
        listing_pda: L_C,
        maker: M1,
        streamflow_metadata: SM_C,
        token_mint: TOK,
        token_decimals: 6,
        vesting_amount_raw: "200000000",
        asking_price_micro_usdc: "15000",
        expires_at: expiresIn(7 * 86400),
        unlock_at: unlockIn(30 * 86400),
      },
    },
    {
      tx_signature: txSig(8),
      event_index: 0,
      slot: 3100,
      name: "BidSubmitted",
      payload: {
        bid_pda: "TestBid3333333333333333333333333333333333",
        listing_pda: L_C,
        bidder: B1,
        price_per_token_micro_usdc: "11000",
        total_usdc_raw: "2200000000",
      },
    },
    {
      tx_signature: txSig(9),
      event_index: 0,
      slot: 3200,
      name: "ListingCancelled",
      payload: {
        listing_pda: L_C,
        maker: M1,
        streamflow_metadata: SM_C,
        swept_token_amount: "0",
      },
    },
    {
      tx_signature: txSig(10),
      event_index: 0,
      slot: 3300,
      name: "BidWithdrawn",
      payload: {
        bid_pda: "TestBid3333333333333333333333333333333333",
        listing_pda: L_C,
        bidder: B1,
        total_usdc_raw: "2200000000",
      },
    },
  ]);

  const orderC = (await db.select().from(schema.orders).where(eq(schema.orders.listingPda, L_C)))[0];
  expect("C: cancel → CANCELLED", orderC?.status === "CANCELLED");
  const bidC = (await db.select().from(schema.bids).where(eq(schema.bids.bidPda, "TestBid3333333333333333333333333333333333")))[0];
  expect("C: withdrawn bid → WITHDRAWN", bidC?.status === "WITHDRAWN");

  // ----- Scenario D: expire path -----
  await ingestEvents([
    {
      tx_signature: txSig(11),
      event_index: 0,
      slot: 4000,
      name: "ListingCreated",
      payload: {
        listing_pda: L_D,
        maker: M1,
        streamflow_metadata: SM_D,
        token_mint: TOK,
        token_decimals: 6,
        vesting_amount_raw: "50000000",
        asking_price_micro_usdc: "20000",
        expires_at: expiresIn(7 * 86400),
        unlock_at: unlockIn(30 * 86400),
      },
    },
    {
      tx_signature: txSig(12),
      event_index: 0,
      slot: 4100,
      name: "ListingExpired",
      payload: {
        listing_pda: L_D,
        maker: M1,
        streamflow_metadata: SM_D,
        swept_token_amount: "12345",
      },
    },
  ]);

  const orderD = (await db.select().from(schema.orders).where(eq(schema.orders.listingPda, L_D)))[0];
  expect("D: expire → EXPIRED", orderD?.status === "EXPIRED");
  expect("D: non-zero swept persisted", orderD?.sweptTokenAmount === "12345");

  // ----- Scenario E: idempotency (replay scenario A) -----
  const result = await ingestEvents([
    {
      tx_signature: txSig(1),
      event_index: 0,
      slot: 1000,
      name: "ListingCreated",
      payload: {
        listing_pda: L_A,
        maker: M1,
        streamflow_metadata: SM_A,
        token_mint: TOK,
        token_decimals: 6,
        vesting_amount_raw: "999999999",  // tampered — must be ignored
        asking_price_micro_usdc: "99",
        expires_at: 1,
        unlock_at: 2,
      },
    },
    {
      tx_signature: txSig(3),
      event_index: 0,
      slot: 1200,
      name: "OrderTaken",
      payload: {
        listing_pda: L_A,
        streamflow_metadata: SM_A,
        maker: M1,
        taker: T1,
        token_mint: TOK,
        vesting_amount_raw: "999",
        price_per_token_micro_usdc: "99",
        total_usdc_raw: "99",
        market_price_micro_usdc: null,
        mode: "asking",
        accepted_bid_pda: null,
        swept_token_amount: "999",
      },
    },
  ]);
  expect("E: replay → applied=0, skipped=2", result.applied === 0 && result.skipped_duplicates === 2,
    `applied=${result.applied} skipped=${result.skipped_duplicates}`);

  const orderAAfterReplay = (await db.select().from(schema.orders).where(eq(schema.orders.listingPda, L_A)))[0];
  expect("E: tampered field DID NOT overwrite original", orderAAfterReplay?.vestingAmountRaw === "1000000000",
    `actual=${orderAAfterReplay?.vestingAmountRaw}`);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n=== ${checks.length - failed.length}/${checks.length} passed ===`);
  if (failed.length) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
