import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  walletAddress: text("wallet_address").primaryKey(),
  displayName: text("display_name"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
});

export const orders = pgTable(
  "orders",
  {
    listingPda: text("listing_pda").primaryKey(),
    makerWallet: text("maker_wallet")
      .notNull()
      .references(() => users.walletAddress),
    streamflowMetadata: text("streamflow_metadata").notNull(),
    tokenMint: text("token_mint").notNull(),
    tokenDecimals: smallint("token_decimals").notNull(),
    vestingAmountRaw: numeric("vesting_amount_raw", { precision: 40, scale: 0 }).notNull(),
    unlockAt: timestamp("unlock_at", { withTimezone: true }).notNull(),
    askingPriceMicroUsdc: numeric("asking_price_micro_usdc", { precision: 20, scale: 0 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["LISTED", "SETTLED", "CANCELLED", "EXPIRED"] }).notNull(),
    bidCount: integer("bid_count").notNull().default(0),
    bestBidPriceMicroUsdc: numeric("best_bid_price_micro_usdc", { precision: 20, scale: 0 }),
    sweptTokenAmount: numeric("swept_token_amount", { precision: 40, scale: 0 }),
    createdSlot: bigint("created_slot", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueActiveByMetadata: uniqueIndex("idx_orders_streamflow_active")
      .on(t.streamflowMetadata)
      .where(sql`status = 'LISTED'`),
    byStatusToken: index("idx_orders_status_token").on(t.status, t.tokenMint),
    expiresLeUnlock: check("orders_expires_le_unlock", sql`expires_at <= unlock_at`),
  }),
);

export const bids = pgTable(
  "bids",
  {
    bidPda: text("bid_pda").primaryKey(),
    listingPda: text("listing_pda")
      .notNull()
      .references(() => orders.listingPda),
    bidderWallet: text("bidder_wallet")
      .notNull()
      .references(() => users.walletAddress),
    pricePerTokenMicroUsdc: numeric("price_per_token_micro_usdc", { precision: 20, scale: 0 }).notNull(),
    totalUsdcRaw: numeric("total_usdc_raw", { precision: 20, scale: 0 }).notNull(),
    status: text("status", { enum: ["OPEN", "ACCEPTED", "WITHDRAWN"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePerListingBidder: uniqueIndex("idx_bids_listing_bidder").on(t.listingPda, t.bidderWallet),
    byListingStatus: index("idx_bids_listing_status").on(t.listingPda, t.status),
    byBidderStatus: index("idx_bids_bidder_status").on(t.bidderWallet, t.status),
  }),
);

export const tradeHistory = pgTable("trade_history", {
  tradeId: bigserial("trade_id", { mode: "bigint" }).primaryKey(),
  txSignature: text("tx_signature").notNull().unique(),
  listingPda: text("listing_pda").notNull(),
  acceptedBidPda: text("accepted_bid_pda"),
  streamflowMetadata: text("streamflow_metadata").notNull(),
  makerWallet: text("maker_wallet").notNull(),
  takerWallet: text("taker_wallet").notNull(),
  tokenMint: text("token_mint").notNull(),
  vestingAmountRaw: numeric("vesting_amount_raw", { precision: 40, scale: 0 }).notNull(),
  pricePerTokenMicroUsdc: numeric("price_per_token_micro_usdc", { precision: 20, scale: 0 }).notNull(),
  totalUsdcRaw: numeric("total_usdc_raw", { precision: 20, scale: 0 }).notNull(),
  marketPriceMicroUsdc: numeric("market_price_micro_usdc", { precision: 20, scale: 0 }),
  discountRate: numeric("discount_rate", { precision: 8, scale: 6 }).generatedAlwaysAs(
    sql`1 - (price_per_token_micro_usdc::numeric(40,10) / NULLIF(market_price_micro_usdc, 0)::numeric(40,10))`,
  ),
  mode: text("mode", { enum: ["asking", "bid"] }).notNull(),
  sweptTokenAmount: numeric("swept_token_amount", { precision: 40, scale: 0 }).notNull().default("0"),
  settledAt: timestamp("settled_at", { withTimezone: true }).notNull(),
  blockSlot: bigint("block_slot", { mode: "bigint" }),
});

export const processedEvents = pgTable(
  "processed_events",
  {
    txSignature: text("tx_signature").notNull(),
    eventIndex: integer("event_index").notNull(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.txSignature, t.eventIndex] }),
  }),
);

export const reconciliationIssues = pgTable("reconciliation_issues", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  listingPda: text("listing_pda").notNull(),
  issueType: text("issue_type").notNull(),
  details: jsonb("details").notNull(),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});
