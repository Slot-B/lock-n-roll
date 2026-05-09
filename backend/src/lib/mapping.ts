import type { OrderSummary, OrderDetail, BidView, BidWithContext, TradeRecord } from "@lock-n-roll/shared";
import type { schema } from "../db/client.js";

type OrderRow = typeof schema.orders.$inferSelect;
type BidRow = typeof schema.bids.$inferSelect;
type TradeRow = typeof schema.tradeHistory.$inferSelect;

const toAmount = (v: string | null): string | null => v;
const toAmountReq = (v: string): string => v;
const toIso = (d: Date): string => d.toISOString();

function discountFromPrices(price: string | null, market: string | null): number | null {
  if (!price || !market) return null;
  const p = Number(price);
  const m = Number(market);
  if (m === 0 || !Number.isFinite(p) || !Number.isFinite(m)) return null;
  return 1 - p / m;
}

export function toOrderSummary(o: OrderRow, marketPrice: string | null = null): OrderSummary {
  const refPrice = o.askingPriceMicroUsdc ?? o.bestBidPriceMicroUsdc;
  return {
    listing_pda: o.listingPda,
    maker_wallet: o.makerWallet,
    streamflow_metadata: o.streamflowMetadata,
    token_mint: o.tokenMint,
    token_decimals: o.tokenDecimals,
    vesting_amount_raw: toAmountReq(o.vestingAmountRaw),
    unlock_at: toIso(o.unlockAt),
    expires_at: toIso(o.expiresAt),
    asking_price_micro_usdc: toAmount(o.askingPriceMicroUsdc),
    best_bid_price_micro_usdc: toAmount(o.bestBidPriceMicroUsdc),
    bid_count: o.bidCount,
    status: o.status,
    market_price_micro_usdc: marketPrice,
    estimated_discount_rate: discountFromPrices(refPrice, marketPrice),
    created_at: toIso(o.createdAt),
  };
}

export function toBidView(b: BidRow, parentStatus: OrderRow["status"]): BidView {
  return {
    bid_pda: b.bidPda,
    bidder_wallet: b.bidderWallet,
    price_per_token_micro_usdc: toAmountReq(b.pricePerTokenMicroUsdc),
    total_usdc_raw: toAmountReq(b.totalUsdcRaw),
    status: b.status,
    refund_available: b.status === "OPEN" && parentStatus !== "LISTED",
    created_at: toIso(b.createdAt),
  };
}

export function toBidWithContext(b: BidRow, parentStatus: OrderRow["status"]): BidWithContext {
  return {
    bid_pda: b.bidPda,
    listing_pda: b.listingPda,
    listing_status: parentStatus,
    bidder_wallet: b.bidderWallet,
    price_per_token_micro_usdc: toAmountReq(b.pricePerTokenMicroUsdc),
    total_usdc_raw: toAmountReq(b.totalUsdcRaw),
    status: b.status,
    refund_available: b.status === "OPEN" && parentStatus !== "LISTED",
    created_at: toIso(b.createdAt),
  };
}

export function toOrderDetail(o: OrderRow, bids: BidRow[], marketPrice: string | null = null): OrderDetail {
  return {
    ...toOrderSummary(o, marketPrice),
    bids: bids.map((b) => toBidView(b, o.status)),
    swept_token_amount: toAmount(o.sweptTokenAmount),
    streamflow_snapshot: {
      version: 4,
      closed: false,
      last_synced_at: toIso(o.updatedAt),
      drift_warning: null,
    },
  };
}

export function toTradeRecord(t: TradeRow): TradeRecord {
  return {
    trade_id: Number(t.tradeId),
    tx_signature: t.txSignature,
    listing_pda: t.listingPda,
    accepted_bid_pda: t.acceptedBidPda,
    streamflow_metadata: t.streamflowMetadata,
    maker_wallet: t.makerWallet,
    taker_wallet: t.takerWallet,
    token_mint: t.tokenMint,
    vesting_amount_raw: toAmountReq(t.vestingAmountRaw),
    price_per_token_micro_usdc: toAmountReq(t.pricePerTokenMicroUsdc),
    total_usdc_raw: toAmountReq(t.totalUsdcRaw),
    market_price_micro_usdc: toAmount(t.marketPriceMicroUsdc),
    discount_rate: t.discountRate ? Number(t.discountRate) : null,
    mode: t.mode,
    swept_token_amount: toAmountReq(t.sweptTokenAmount),
    settled_at: toIso(t.settledAt),
    block_slot: t.blockSlot ? Number(t.blockSlot) : 0,
  };
}
