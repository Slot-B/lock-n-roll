import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { ok } from "../lib/responses.js";
import { NotFound } from "../lib/errorEnvelope.js";
import { toOrderDetail, toOrderSummary } from "../lib/mapping.js";

const ListQuery = z.object({
  status: z.enum(["LISTED", "SETTLED", "CANCELLED", "EXPIRED"]).optional().default("LISTED"),
  token: z.string().optional(),
  buy_now_only: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  sort: z.enum(["created_desc", "expires_asc"]).optional().default("created_desc"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export async function ordersRoutes(app: FastifyInstance) {
  app.get("/orders", async (req) => {
    const q = ListQuery.parse(req.query);

    const conditions = [eq(schema.orders.status, q.status)];
    if (q.token) conditions.push(eq(schema.orders.tokenMint, q.token));
    if (q.buy_now_only) conditions.push(sql`asking_price_micro_usdc IS NOT NULL`);

    const sortClause = q.sort === "expires_asc" ? asc(schema.orders.expiresAt) : desc(schema.orders.createdAt);

    const rows = await db
      .select()
      .from(schema.orders)
      .where(and(...conditions))
      .orderBy(sortClause)
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const slice = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? slice[slice.length - 1]!.listingPda : null;

    return ok(slice.map((r) => toOrderSummary(r)), nextCursor);
  });

  app.get<{ Params: { listing_pda: string } }>("/orders/:listing_pda", async (req) => {
    const { listing_pda } = req.params;

    const orderRows = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.listingPda, listing_pda))
      .limit(1);

    const order = orderRows[0];
    if (!order) throw NotFound(`Listing ${listing_pda} not found`);

    const bidRows = await db
      .select()
      .from(schema.bids)
      .where(eq(schema.bids.listingPda, listing_pda))
      .orderBy(desc(schema.bids.pricePerTokenMicroUsdc));

    return ok(toOrderDetail(order, bidRows));
  });
}
