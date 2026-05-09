import { z } from "zod";

const Pubkey = z.string().min(32).max(48);
const Amount = z.string().regex(/^\d+$/);

export const ListingCreatedSchema = z.object({
  listing_pda: Pubkey,
  maker: Pubkey,
  streamflow_metadata: Pubkey,
  token_mint: Pubkey,
  token_decimals: z.number().int().min(0).max(18),
  vesting_amount_raw: Amount,
  asking_price_micro_usdc: Amount.nullable(),
  expires_at: z.number().int().nonnegative(),
  unlock_at: z.number().int().nonnegative(),
});
export type ListingCreatedPayload = z.infer<typeof ListingCreatedSchema>;

export const BidSubmittedSchema = z.object({
  bid_pda: Pubkey,
  listing_pda: Pubkey,
  bidder: Pubkey,
  price_per_token_micro_usdc: Amount,
  total_usdc_raw: Amount,
});
export type BidSubmittedPayload = z.infer<typeof BidSubmittedSchema>;

export const BidWithdrawnSchema = z.object({
  bid_pda: Pubkey,
  listing_pda: Pubkey,
  bidder: Pubkey,
  total_usdc_raw: Amount,
});
export type BidWithdrawnPayload = z.infer<typeof BidWithdrawnSchema>;

export const OrderTakenSchema = z.object({
  listing_pda: Pubkey,
  streamflow_metadata: Pubkey,
  maker: Pubkey,
  taker: Pubkey,
  token_mint: Pubkey,
  vesting_amount_raw: Amount,
  price_per_token_micro_usdc: Amount,
  total_usdc_raw: Amount,
  market_price_micro_usdc: Amount.nullable(),
  mode: z.enum(["asking", "bid"]),
  accepted_bid_pda: Pubkey.nullable(),
  swept_token_amount: Amount,
});
export type OrderTakenPayload = z.infer<typeof OrderTakenSchema>;

export const ListingCancelledSchema = z.object({
  listing_pda: Pubkey,
  maker: Pubkey,
  streamflow_metadata: Pubkey,
  swept_token_amount: Amount,
});
export type ListingCancelledPayload = z.infer<typeof ListingCancelledSchema>;

export const ListingExpiredSchema = z.object({
  listing_pda: Pubkey,
  maker: Pubkey,
  streamflow_metadata: Pubkey,
  swept_token_amount: Amount,
});
export type ListingExpiredPayload = z.infer<typeof ListingExpiredSchema>;

export const EventEnvelopeSchema = z.object({
  tx_signature: z.string().min(64).max(96),
  event_index: z.number().int().nonnegative(),
  slot: z.number().int().nonnegative(),
  name: z.enum([
    "ListingCreated",
    "BidSubmitted",
    "BidWithdrawn",
    "OrderTaken",
    "ListingCancelled",
    "ListingExpired",
  ]),
  payload: z.record(z.unknown()),
});
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

export const EventBatchSchema = z.array(EventEnvelopeSchema);
