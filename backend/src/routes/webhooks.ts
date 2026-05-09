import type { FastifyInstance } from "fastify";
import { config } from "../config/env.js";
import { EventBatchSchema } from "../indexer/eventSchemas.js";
import { ingestEvents } from "../indexer/pipeline.js";
import { ok } from "../lib/responses.js";

export async function webhookRoutes(app: FastifyInstance) {
  // Real Helius webhook entry. For v1 we accept already-parsed events
  // (operator pre-parses Helius tx logs into our envelope shape, OR an
  // out-of-process parser does it). The IDL-based Borsh decoder lives
  // outside this MVP and will plug in via the same envelope.
  app.post("/webhooks/helius", async (req, reply) => {
    const auth = req.headers.authorization ?? "";
    if (auth !== config.heliusWebhookSecret) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid webhook secret", details: {} },
      });
    }

    const events = EventBatchSchema.parse(req.body);
    // 200 ACK first (Helius retries after 5s timeout)
    void ingestEvents(events).catch((err) => app.log.error(err, "ingest pipeline error"));
    return reply.status(202).send(ok({ accepted: events.length }));
  });

  // Synchronous dev/test endpoint — same envelope, returns ingest result.
  app.post("/webhooks/dev-events", async (req) => {
    if (config.nodeEnv === "production") {
      return { error: { code: "FORBIDDEN", message: "dev-only", details: {} } };
    }
    const events = EventBatchSchema.parse(req.body);
    const result = await ingestEvents(events);
    return ok(result);
  });
}
