import { eq } from "drizzle-orm";
import { schema } from "../../db/client.js";
import { ListingCancelledSchema, type EventEnvelope } from "../eventSchemas.js";

export async function handleListingCancelled(tx: any, ev: EventEnvelope) {
  const p = ListingCancelledSchema.parse(ev.payload);

  await tx
    .update(schema.orders)
    .set({
      status: "CANCELLED",
      sweptTokenAmount: p.swept_token_amount,
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.listingPda, p.listing_pda));
}
