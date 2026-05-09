import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });

const W_MAKER1 = "Maker1111111111111111111111111111111111111";
const W_MAKER2 = "Maker2222222222222222222222222222222222222";
const W_TAKER1 = "Taker1111111111111111111111111111111111111";
const W_BIDDER1 = "Bidder111111111111111111111111111111111111";
const W_BIDDER2 = "Bidder222222222222222222222222222222222222";

const TOKEN_BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const STREAM_META_1 = "Stream1111111111111111111111111111111111111";
const STREAM_META_2 = "Stream2222222222222222222222222222222222222";
const STREAM_META_3 = "Stream3333333333333333333333333333333333333";

const LISTING_1 = "Listing111111111111111111111111111111111111";
const LISTING_2 = "Listing222222222222222222222222222222222222";
const LISTING_3 = "Listing333333333333333333333333333333333333";

const BID_1 = "Bid1111111111111111111111111111111111111111";
const BID_2 = "Bid2222222222222222222222222222222222222222";

const days = (n: number) => new Date(Date.now() + n * 86400_000);

async function main() {
  console.log("Wiping existing data…");
  await db.delete(schema.bids);
  await db.delete(schema.tradeHistory);
  await db.delete(schema.orders);
  await db.delete(schema.users);
  await db.delete(schema.processedEvents);
  await db.delete(schema.reconciliationIssues);

  console.log("Seeding users…");
  await db.insert(schema.users).values([
    { walletAddress: W_MAKER1 },
    { walletAddress: W_MAKER2 },
    { walletAddress: W_TAKER1 },
    { walletAddress: W_BIDDER1 },
    { walletAddress: W_BIDDER2 },
  ]);

  console.log("Seeding orders…");
  await db.insert(schema.orders).values([
    {
      listingPda: LISTING_1,
      makerWallet: W_MAKER1,
      streamflowMetadata: STREAM_META_1,
      tokenMint: TOKEN_BONK,
      tokenDecimals: 5,
      vestingAmountRaw: "10000000000",
      unlockAt: days(30),
      askingPriceMicroUsdc: "12000",
      expiresAt: days(7),
      status: "LISTED",
      bidCount: 1,
      bestBidPriceMicroUsdc: "10000",
    },
    {
      listingPda: LISTING_2,
      makerWallet: W_MAKER2,
      streamflowMetadata: STREAM_META_2,
      tokenMint: TOKEN_BONK,
      tokenDecimals: 5,
      vestingAmountRaw: "5000000000",
      unlockAt: days(60),
      askingPriceMicroUsdc: null,
      expiresAt: days(14),
      status: "LISTED",
      bidCount: 1,
      bestBidPriceMicroUsdc: "8500",
    },
    {
      listingPda: LISTING_3,
      makerWallet: W_MAKER1,
      streamflowMetadata: STREAM_META_3,
      tokenMint: TOKEN_BONK,
      tokenDecimals: 5,
      vestingAmountRaw: "2000000000",
      unlockAt: days(15),
      askingPriceMicroUsdc: "15000",
      expiresAt: days(-1),
      status: "SETTLED",
      bidCount: 0,
      sweptTokenAmount: "0",
    },
  ]);

  console.log("Seeding bids…");
  await db.insert(schema.bids).values([
    {
      bidPda: BID_1,
      listingPda: LISTING_1,
      bidderWallet: W_BIDDER1,
      pricePerTokenMicroUsdc: "10000",
      totalUsdcRaw: "1000000000",
      status: "OPEN",
    },
    {
      bidPda: BID_2,
      listingPda: LISTING_2,
      bidderWallet: W_BIDDER2,
      pricePerTokenMicroUsdc: "8500",
      totalUsdcRaw: "425000000",
      status: "OPEN",
    },
  ]);

  console.log("Seeding trade_history…");
  await db.insert(schema.tradeHistory).values([
    {
      txSignature: "SeedTxSig111111111111111111111111111111111111111111111111111111111111111111111111111",
      listingPda: LISTING_3,
      acceptedBidPda: null,
      streamflowMetadata: STREAM_META_3,
      makerWallet: W_MAKER1,
      takerWallet: W_TAKER1,
      tokenMint: TOKEN_BONK,
      vestingAmountRaw: "2000000000",
      pricePerTokenMicroUsdc: "15000",
      totalUsdcRaw: "300000000",
      marketPriceMicroUsdc: "20000",
      mode: "asking",
      sweptTokenAmount: "0",
      settledAt: days(-1),
      blockSlot: 312500000n,
    },
  ]);

  console.log("Done.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
