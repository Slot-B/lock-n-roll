import type { FastifyInstance } from "fastify";
import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { ok } from "../lib/responses.js";
import { toTradeRecord } from "../lib/mapping.js";

const Q = z.object({
  wallet: z.string().optional(),
  token: z.string().optional(),
  mode: z.enum(["asking", "bid"]).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export async function historyRoutes(app: FastifyInstance) {
  app.get("/history", async (req) => {
    const q = Q.parse(req.query);

    const conditions = [];
    if (q.wallet) {
      const w = q.wallet;
      conditions.push(or(eq(schema.tradeHistory.makerWallet, w), eq(schema.tradeHistory.takerWallet, w)));
    }
    if (q.token) conditions.push(eq(schema.tradeHistory.tokenMint, q.token));
    if (q.mode) conditions.push(eq(schema.tradeHistory.mode, q.mode));
    if (q.from) conditions.push(gte(schema.tradeHistory.settledAt, new Date(q.from)));
    if (q.to) conditions.push(lte(schema.tradeHistory.settledAt, new Date(q.to)));

    const rows = await db
      .select()
      .from(schema.tradeHistory)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.tradeHistory.settledAt))
      .limit(q.limit);

    return ok(rows.map(toTradeRecord));
  });
}
