export type ListingStatus = "LISTED" | "SETTLED" | "CANCELLED" | "EXPIRED";
export type BidStatus = "OPEN" | "ACCEPTED" | "WITHDRAWN";
export type SettlementMode = "asking" | "bid";

export type ApiAmount = string;

export type StreamEventName =
  | "ListingCreated"
  | "BidSubmitted"
  | "BidWithdrawn"
  | "OrderTaken"
  | "ListingCancelled"
  | "ListingExpired";
