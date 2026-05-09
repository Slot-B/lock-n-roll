import { db, schema } from "../db/client.js";
import { HANDLERS } from "./handlers/index.js";
import type { EventEnvelope } from "./eventSchemas.js";

export type IngestResult = {
  applied: number;
  skipped_duplicates: number;
  failed: number;
};

export async function ingestEvents(events: EventEnvelope[]): Promise<IngestResult> {
  const result: IngestResult = { applied: 0, skipped_duplicates: 0, failed: 0 };

  for (const ev of events) {
    try {
      await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(schema.processedEvents)
          .values({
            txSignature: ev.tx_signature,
            eventIndex: ev.event_index,
            eventType: ev.name,
          })
          .onConflictDoNothing()
          .returning({ tx: schema.processedEvents.txSignature });

        if (inserted.length === 0) {
          result.skipped_duplicates += 1;
          return;
        }

        const handler = HANDLERS[ev.name];
        await handler(tx, ev);
        result.applied += 1;
      });
    } catch (err) {
      result.failed += 1;
      console.error(`[ingest] failed ${ev.name}@${ev.tx_signature}#${ev.event_index}`, err);
    }
  }

  return result;
}
