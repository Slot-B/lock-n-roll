import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { schema } from "../../db/client.js";
import { BidSubmittedSchema, type EventEnvelope } from "../eventSchemas.js";

export async function handleBidSubmitted(tx: any, ev: EventEnvelope) {
  const p = BidSubmittedSchema.parse(ev.payload);

  await tx
    .insert(schema.users)
    .values({ walletAddress: p.bidder })
    .onConflictDoNothing();

  await tx
    .insert(schema.bids)
    .values({
      bidPda: p.bid_pda,
      listingPda: p.listing_pda,
      bidderWallet: p.bidder,
      pricePerTokenMicroUsdc: p.price_per_token_micro_usdc,
      totalUsdcRaw: p.total_usdc_raw,
      status: "OPEN",
    })
    .onConflictDoNothing();

  await tx.execute(sql`
    UPDATE orders SET
      bid_count = bid_count + 1,
      best_bid_price_micro_usdc = (
        SELECT MAX(price_per_token_micro_usdc)
        FROM bids
        WHERE listing_pda = ${p.listing_pda} AND status = 'OPEN'
      ),
      updated_at = NOW()
    WHERE listing_pda = ${p.listing_pda}
  `);
}
