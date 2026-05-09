import { eq } from "drizzle-orm";
import { schema } from "../../db/client.js";
import { ListingExpiredSchema, type EventEnvelope } from "../eventSchemas.js";

export async function handleListingExpired(tx: any, ev: EventEnvelope) {
  const p = ListingExpiredSchema.parse(ev.payload);

  await tx
    .update(schema.orders)
    .set({
      status: "EXPIRED",
      sweptTokenAmount: p.swept_token_amount,
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.listingPda, p.listing_pda));
}
