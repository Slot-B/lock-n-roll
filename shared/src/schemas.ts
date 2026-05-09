import { z } from "zod";

export const ListingStatusSchema = z.enum(["LISTED", "SETTLED", "CANCELLED", "EXPIRED"]);
export const BidStatusSchema = z.enum(["OPEN", "ACCEPTED", "WITHDRAWN"]);
export const SettlementModeSchema = z.enum(["asking", "bid"]);

const ApiAmountSchema = z.string().regex(/^\d+$/, "ApiAmount must be a non-negative integer string");

export const OrderSummarySchema = z.object({
  listing_pda: z.string(),
  maker_wallet: z.string(),
  streamflow_metadata: z.string(),
  token_mint: z.string(),
  token_decimals: z.number().int().min(0).max(18),
  vesting_amount_raw: ApiAmountSchema,
  unlock_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  asking_price_micro_usdc: ApiAmountSchema.nullable(),
  best_bid_price_micro_usdc: ApiAmountSchema.nullable(),
  bid_count: z.number().int().nonnegative(),
  status: ListingStatusSchema,
  market_price_micro_usdc: ApiAmountSchema.nullable(),
  estimated_discount_rate: z.number().nullable(),
  created_at: z.string().datetime(),
});
export type OrderSummary = z.infer<typeof OrderSummarySchema>;

export const BidViewSchema = z.object({
  bid_pda: z.string(),
  bidder_wallet: z.string(),
  price_per_token_micro_usdc: ApiAmountSchema,
  total_usdc_raw: ApiAmountSchema,
  status: BidStatusSchema,
  refund_available: z.boolean(),
  created_at: z.string().datetime(),
});
export type BidView = z.infer<typeof BidViewSchema>;

export const StreamflowSnapshotSchema = z.object({
  version: z.number().int(),
  closed: z.boolean(),
  last_synced_at: z.string().datetime(),
  drift_warning: z.string().nullable(),
});
export type StreamflowSnapshot = z.infer<typeof StreamflowSnapshotSchema>;

export const OrderDetailSchema = OrderSummarySchema.extend({
  bids: z.array(BidViewSchema),
  swept_token_amount: ApiAmountSchema.nullable(),
  streamflow_snapshot: StreamflowSnapshotSchema,
});
export type OrderDetail = z.infer<typeof OrderDetailSchema>;

export const BidWithContextSchema = z.object({
  bid_pda: z.string(),
  listing_pda: z.string(),
  listing_status: ListingStatusSchema,
  bidder_wallet: z.string(),
  price_per_token_micro_usdc: ApiAmountSchema,
  total_usdc_raw: ApiAmountSchema,
  status: BidStatusSchema,
  refund_available: z.boolean(),
  created_at: z.string().datetime(),
});
export type BidWithContext = z.infer<typeof BidWithContextSchema>;

export const TradeRecordSchema = z.object({
  trade_id: z.number().int().nonnegative(),
  tx_signature: z.string(),
  listing_pda: z.string(),
  accepted_bid_pda: z.string().nullable(),
  streamflow_metadata: z.string(),
  maker_wallet: z.string(),
  taker_wallet: z.string(),
  token_mint: z.string(),
  vesting_amount_raw: ApiAmountSchema,
  price_per_token_micro_usdc: ApiAmountSchema,
  total_usdc_raw: ApiAmountSchema,
  market_price_micro_usdc: ApiAmountSchema.nullable(),
  discount_rate: z.number().nullable(),
  mode: SettlementModeSchema,
  swept_token_amount: ApiAmountSchema,
  settled_at: z.string().datetime(),
  block_slot: z.number().int().nonnegative(),
});
export type TradeRecord = z.infer<typeof TradeRecordSchema>;

export const HealthSchema = z.object({
  ok: z.boolean(),
  slot: z.number().int().nonnegative(),
  lag_ms: z.number().int().nonnegative(),
  reconcile_lag_min: z.number().int().nonnegative(),
});
export type Health = z.infer<typeof HealthSchema>;

export const ApiMetaSchema = z.object({
  ts: z.string().datetime(),
  next_cursor: z.string().nullable().optional(),
});

export function apiResponseSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, meta: ApiMetaSchema });
}

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const StreamCandidateSchema = z.object({
  streamflowMetadata: z.string(),
  mint: z.string(),
  tokenDecimals: z.number().int().min(0).max(18),
  vestingAmountRaw: ApiAmountSchema,
  unlockAt: z.string().datetime(),
  eligible: z.boolean(),
  rejectionReasons: z.array(
    z.enum([
      "TRADABLE_CONTRACTS_REQUIREMENT",
      "LOCK_N_ROLL_POLICY",
      "STRUCTURAL",
      "TOKEN_2022_NOT_SUPPORTED",
    ]),
  ),
  rejectionDetails: z.array(z.string()).optional(),
});
export type StreamCandidate = z.infer<typeof StreamCandidateSchema>;
