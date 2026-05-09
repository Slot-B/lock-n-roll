import type { EventEnvelope } from "../eventSchemas.js";
import { handleListingCreated } from "./listingCreated.js";
import { handleBidSubmitted } from "./bidSubmitted.js";
import { handleBidWithdrawn } from "./bidWithdrawn.js";
import { handleOrderTaken } from "./orderTaken.js";
import { handleListingCancelled } from "./listingCancelled.js";
import { handleListingExpired } from "./listingExpired.js";

type Handler = (tx: any, ev: EventEnvelope) => Promise<void>;

export const HANDLERS: Record<EventEnvelope["name"], Handler> = {
  ListingCreated: handleListingCreated,
  BidSubmitted: handleBidSubmitted,
  BidWithdrawn: handleBidWithdrawn,
  OrderTaken: handleOrderTaken,
  ListingCancelled: handleListingCancelled,
  ListingExpired: handleListingExpired,
};
