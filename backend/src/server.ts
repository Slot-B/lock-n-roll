import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { config } from "./config/env.js";
import { registerErrorHandler } from "./lib/errorEnvelope.js";
import { ordersRoutes } from "./routes/orders.js";
import { bidsRoutes } from "./routes/bids.js";
import { historyRoutes } from "./routes/history.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { adminRoutes } from "./routes/admin.js";
import { startReconciliationCron } from "./reconciliation/cron.js";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === "production" ? "info" : "debug",
      transport:
        config.nodeEnv === "production"
          ? undefined
          : { target: "pino-pretty", options: { colorize: true } },
    },
  });

  await app.register(sensible);
  registerErrorHandler(app);

  app.get("/health", async () => ({
    ok: true,
    slot: 0,
    lag_ms: 0,
    reconcile_lag_min: 0,
    network: config.network,
  }));

  await app.register(async (api) => {
    await api.register(ordersRoutes);
    await api.register(bidsRoutes);
    await api.register(historyRoutes);
  }, { prefix: "/api/v1" });

  await app.register(webhookRoutes);
  await app.register(adminRoutes);

  if (config.nodeEnv !== "test") {
    startReconciliationCron(app.log);
  }

  return app;
}

async function main() {
  const app = await buildServer();
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main();
}
