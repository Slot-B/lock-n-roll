import { and, eq, sql } from "drizzle-orm";
import { schema } from "../../db/client.js";
import { BidWithdrawnSchema, type EventEnvelope } from "../eventSchemas.js";

export async function handleBidWithdrawn(tx: any, ev: EventEnvelope) {
  const p = BidWithdrawnSchema.parse(ev.payload);

  const existing = await tx
    .select({ status: schema.bids.status })
    .from(schema.bids)
    .where(eq(schema.bids.bidPda, p.bid_pda))
    .limit(1);

  const wasOpen = existing[0]?.status === "OPEN";

  await tx
    .update(schema.bids)
    .set({ status: "WITHDRAWN", updatedAt: new Date() })
    .where(and(eq(schema.bids.bidPda, p.bid_pda), eq(schema.bids.status, "OPEN")));

  if (wasOpen) {
    await tx.execute(sql`
      UPDATE orders SET
        bid_count = CASE WHEN status = 'LISTED' THEN GREATEST(bid_count - 1, 0) ELSE bid_count END,
        best_bid_price_micro_usdc = (
          SELECT MAX(price_per_token_micro_usdc)
          FROM bids
          WHERE listing_pda = ${p.listing_pda} AND status = 'OPEN'
        ),
        updated_at = NOW()
      WHERE listing_pda = ${p.listing_pda}
    `);
  }
}
