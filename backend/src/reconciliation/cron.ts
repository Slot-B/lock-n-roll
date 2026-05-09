import cron from "node-cron";
import type { FastifyBaseLogger } from "fastify";
import { reconcile } from "./checks.js";
import { defaultReader } from "./streamflowReader.js";

let started = false;

export function startReconciliationCron(log: FastifyBaseLogger) {
  if (started) return;
  started = true;

  // Hourly at minute 7 (avoid round-hour spikes)
  cron.schedule("7 * * * *", async () => {
    try {
      const report = await reconcile(defaultReader);
      log.info({ report }, "[reconcile] cron tick complete");
    } catch (err) {
      log.error(err, "[reconcile] cron tick failed");
    }
  });

  log.info("[reconcile] cron scheduled (hourly @ minute 7)");
}

export async function reconcileNow() {
  return reconcile(defaultReader);
}
