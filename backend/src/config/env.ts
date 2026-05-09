import "dotenv/config";
import { ENV, type Network, type NetworkConfig } from "@lock-n-roll/shared";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const network = (process.env.NETWORK ?? "devnet") as Network;
if (!(network in ENV)) {
  throw new Error(`Invalid NETWORK: ${network}. Must be one of: ${Object.keys(ENV).join(", ")}`);
}

const networkConfig: NetworkConfig = {
  ...ENV[network],
  RPC_URL: process.env.RPC_URL || ENV[network].RPC_URL,
};

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  network,
  networkConfig,
  databaseUrl: required("DATABASE_URL", process.env.DATABASE_URL),
  heliusWebhookSecret: process.env.HELIUS_WEBHOOK_SECRET ?? "dev-secret",
} as const;

export type Config = typeof config;
