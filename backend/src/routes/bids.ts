import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { ok } from "../lib/responses.js";
import { toBidWithContext } from "../lib/mapping.js";

const Q = z.object({
  wallet: z.string().optional(),
  listing: z.string().optional(),
  status: z.enum(["OPEN", "ACCEPTED", "WITHDRAWN"]).optional(),
  refund_available: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export async function bidsRoutes(app: FastifyInstance) {
  app.get("/bids", async (req) => {
    const q = Q.parse(req.query);

    const conditions = [];
    if (q.wallet) conditions.push(eq(schema.bids.bidderWallet, q.wallet));
    if (q.listing) conditions.push(eq(schema.bids.listingPda, q.listing));
    if (q.status) conditions.push(eq(schema.bids.status, q.status));

    const bidRows = await db
      .select()
      .from(schema.bids)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.bids.createdAt))
      .limit(q.limit);

    if (bidRows.length === 0) return ok([]);

    const listingIds = Array.from(new Set(bidRows.map((b) => b.listingPda)));
    const orderRows = await db
      .select({ listingPda: schema.orders.listingPda, status: schema.orders.status })
      .from(schema.orders)
      .where(inArray(schema.orders.listingPda, listingIds));
    const statusByListing = new Map(orderRows.map((o) => [o.listingPda, o.status]));

    let result = bidRows.map((b) => toBidWithContext(b, statusByListing.get(b.listingPda) ?? "LISTED"));

    if (q.refund_available) {
      result = result.filter((b) => b.refund_available);
    }

    return ok(result);
  });
}
