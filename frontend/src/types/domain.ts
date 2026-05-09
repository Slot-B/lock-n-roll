/**
 * LOCK N ROLL domain types.
 * Mirrors the API/event payload shape from design-document.md §3.6 / §4.2 / §6.2,
 * plus a few UI-only convenience views (suffix `View`).
 */

export type ListingStatus = "LISTED" | "SETTLED" | "CANCELLED" | "EXPIRED";
export type BidStatus = "OPEN" | "ACCEPTED" | "WITHDRAWN";
export type SettlementMode = "asking" | "bid";

/** Integer raw units encoded as a decimal string (matches spec §6.2). */
export type ApiAmount = string;

/** Minimal token metadata used by every screen. */
export interface Token {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string;
  /** USD spot price, used for discount calculation in v1 (Pyth client-side). */
  marketPriceUsd?: number;
}

/** `orders` row mirror — the canonical Listing on the wire. */
export interface Listing {
  listingPda: string;
  makerWallet: string;
  streamflowMetadata: string;
  tokenMint: string;
  tokenDecimals: number;
  vestingAmountRaw: ApiAmount;
  unlockAt: string; // ISO 8601
  /** Buy Now price set by maker; absent → bid-only listing. */
  askingPriceMicroUsdc?: ApiAmount;
  expiresAt: string;
  status: ListingStatus;
  bidCount: number;
  /** Highest current open-bid price; undefined when no bids open. */
  bestBidPriceMicroUsdc?: ApiAmount;
  createdAt: string;
}

/** `bids` row mirror. */
export interface Bid {
  bidPda: string;
  listingPda: string;
  bidderWallet: string;
  pricePerTokenMicroUsdc: ApiAmount;
  totalUsdcRaw: ApiAmount;
  status: BidStatus;
  createdAt: string;
}

/** `trade_history` row — settled trade. */
export interface Trade {
  tradeId: number;
  txSignature: string;
  listingPda: string;
  acceptedBidPda?: string;
  streamflowMetadata: string;
  makerWallet: string;
  takerWallet: string;
  tokenMint: string;
  vestingAmountRaw: ApiAmount;
  pricePerTokenMicroUsdc: ApiAmount;
  totalUsdcRaw: ApiAmount;
  marketPriceMicroUsdc?: ApiAmount;
  /** 0..1; computed at settle time on the backend. */
  discountRate?: number;
  mode: SettlementMode;
  settledAt: string;
}

/** Streamflow stream eligibility check result, spec §6.2. */
export interface StreamCandidate {
  streamflowMetadata: string;
  mint: string;
  tokenDecimals: number;
  vestingAmountRaw: ApiAmount;
  unlockAt: string;
  eligible: boolean;
  rejectionReasons: Array<
    | "TRADABLE_CONTRACTS_REQUIREMENT"
    | "LOCK_N_ROLL_POLICY"
    | "STRUCTURAL"
    | "TOKEN_2022_NOT_SUPPORTED"
  >;
  rejectionDetails?: string[];
}

// ─── UI-only views ──────────────────────────────────────────────────────

/** Listing joined with its token + a few derived fields for cards. */
export interface ListingView extends Listing {
  token: Token;
  daysUntilUnlock: number;
  daysUntilExpiry: number;
  hasAsking: boolean;
  /**
   * Best discount available to a taker, picking the better of:
   *  - asking_price (immediate buy)
   *  - best_bid_price (would have to outbid)
   * Higher value is more attractive to taker.
   */
  bestDiscountRate?: number;
}

/** Bid + parent listing status to drive the "Refund Available" UX. */
export interface BidWithRefund extends Bid {
  parentStatus: ListingStatus;
  /** OPEN + parent in terminal state (SETTLED/CANCELLED/EXPIRED). */
  refundAvailable: boolean;
}
