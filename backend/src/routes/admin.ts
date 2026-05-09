import type { FastifyInstance } from "fastify";
import { reconcileNow } from "../reconciliation/cron.js";
import { ok } from "../lib/responses.js";

export async function adminRoutes(app: FastifyInstance) {
  // §8.2 step 14: "reconciliation 강제 실행" — synchronously run + return report
  app.post("/admin/reconcile", async () => {
    const report = await reconcileNow();
    return ok(report);
  });
}
