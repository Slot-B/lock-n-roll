import { and, eq } from "drizzle-orm";
import { schema } from "../../db/client.js";
import { OrderTakenSchema, type EventEnvelope } from "../eventSchemas.js";

export async function handleOrderTaken(tx: any, ev: EventEnvelope) {
  const p = OrderTakenSchema.parse(ev.payload);

  await tx
    .insert(schema.users)
    .values([{ walletAddress: p.maker }, { walletAddress: p.taker }])
    .onConflictDoNothing();

  await tx
    .update(schema.orders)
    .set({
      status: "SETTLED",
      sweptTokenAmount: p.swept_token_amount,
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.listingPda, p.listing_pda));

  if (p.mode === "bid" && p.accepted_bid_pda) {
    await tx
      .update(schema.bids)
      .set({ status: "ACCEPTED", updatedAt: new Date() })
      .where(and(eq(schema.bids.bidPda, p.accepted_bid_pda), eq(schema.bids.status, "OPEN")));
  }

  await tx
    .insert(schema.tradeHistory)
    .values({
      txSignature: ev.tx_signature,
      listingPda: p.listing_pda,
      acceptedBidPda: p.accepted_bid_pda,
      streamflowMetadata: p.streamflow_metadata,
      makerWallet: p.maker,
      takerWallet: p.taker,
      tokenMint: p.token_mint,
      vestingAmountRaw: p.vesting_amount_raw,
      pricePerTokenMicroUsdc: p.price_per_token_micro_usdc,
      totalUsdcRaw: p.total_usdc_raw,
      marketPriceMicroUsdc: p.market_price_micro_usdc,
      mode: p.mode,
      sweptTokenAmount: p.swept_token_amount,
      settledAt: new Date(),
      blockSlot: BigInt(ev.slot),
    })
    .onConflictDoNothing();
}
