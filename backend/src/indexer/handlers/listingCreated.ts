import type { PgTransaction } from "drizzle-orm/pg-core";
import { schema } from "../../db/client.js";
import { ListingCreatedSchema, type EventEnvelope } from "../eventSchemas.js";

export async function handleListingCreated(tx: any, ev: EventEnvelope) {
  const p = ListingCreatedSchema.parse(ev.payload);

  await tx
    .insert(schema.users)
    .values({ walletAddress: p.maker })
    .onConflictDoNothing();

  await tx
    .insert(schema.orders)
    .values({
      listingPda: p.listing_pda,
      makerWallet: p.maker,
      streamflowMetadata: p.streamflow_metadata,
      tokenMint: p.token_mint,
      tokenDecimals: p.token_decimals,
      vestingAmountRaw: p.vesting_amount_raw,
      unlockAt: new Date(p.unlock_at * 1000),
      askingPriceMicroUsdc: p.asking_price_micro_usdc,
      expiresAt: new Date(p.expires_at * 1000),
      status: "LISTED",
      bidCount: 0,
      createdSlot: BigInt(ev.slot),
    })
    .onConflictDoNothing();
}
