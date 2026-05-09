import { z } from "zod";

/**
 * Solana base58 public key string.
 * Constants are still encoded as strings here; conversion to {@link PublicKey}
 * happens in `lib/network.ts` so this module stays free of web3.js imports
 * and works in edge runtimes.
 */
const PublicKeyString = z
  .string()
  .min(32, "Solana public key must be at least 32 chars")
  .max(44, "Solana public key must be at most 44 chars")
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, "Must be base58-encoded");

/** Coerces empty / whitespace strings to `undefined` so `.optional()` works. */
const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const envSchema = z.object({
  NEXT_PUBLIC_NETWORK: z.enum(["devnet", "mainnet"]).default("devnet"),

  NEXT_PUBLIC_DEVNET_RPC_URL: z.string().url(),
  NEXT_PUBLIC_MAINNET_RPC_URL: z.string().url(),

  // Optional: LOCK N ROLL program IDs are filled after `anchor deploy`.
  NEXT_PUBLIC_LOCK_N_ROLL_DEVNET_ID: z.preprocess(
    emptyToUndefined,
    PublicKeyString.optional(),
  ),
  NEXT_PUBLIC_LOCK_N_ROLL_MAINNET_ID: z.preprocess(
    emptyToUndefined,
    PublicKeyString.optional(),
  ),

  // Streamflow IDs are fixed and required.
  NEXT_PUBLIC_STREAMFLOW_DEVNET_ID: PublicKeyString,
  NEXT_PUBLIC_STREAMFLOW_MAINNET_ID: PublicKeyString,

  // USDC mints are required per network.
  NEXT_PUBLIC_USDC_DEVNET_MINT: PublicKeyString,
  NEXT_PUBLIC_USDC_MAINNET_MINT: PublicKeyString,

  // Pinned Streamflow contract version (decode-time guard).
  NEXT_PUBLIC_EXPECTED_STREAMFLOW_VERSION: z.coerce
    .number()
    .int()
    .nonnegative(),
});

// Statically reference each var so Next.js inlines them into the client bundle.
// `process.env.NEXT_PUBLIC_*` MUST be statically referenced — dynamic property
// access does not work for client bundles.
const raw = {
  NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK,
  NEXT_PUBLIC_DEVNET_RPC_URL: process.env.NEXT_PUBLIC_DEVNET_RPC_URL,
  NEXT_PUBLIC_MAINNET_RPC_URL: process.env.NEXT_PUBLIC_MAINNET_RPC_URL,
  NEXT_PUBLIC_LOCK_N_ROLL_DEVNET_ID:
    process.env.NEXT_PUBLIC_LOCK_N_ROLL_DEVNET_ID,
  NEXT_PUBLIC_LOCK_N_ROLL_MAINNET_ID:
    process.env.NEXT_PUBLIC_LOCK_N_ROLL_MAINNET_ID,
  NEXT_PUBLIC_STREAMFLOW_DEVNET_ID:
    process.env.NEXT_PUBLIC_STREAMFLOW_DEVNET_ID,
  NEXT_PUBLIC_STREAMFLOW_MAINNET_ID:
    process.env.NEXT_PUBLIC_STREAMFLOW_MAINNET_ID,
  NEXT_PUBLIC_USDC_DEVNET_MINT: process.env.NEXT_PUBLIC_USDC_DEVNET_MINT,
  NEXT_PUBLIC_USDC_MAINNET_MINT: process.env.NEXT_PUBLIC_USDC_MAINNET_MINT,
  NEXT_PUBLIC_EXPECTED_STREAMFLOW_VERSION:
    process.env.NEXT_PUBLIC_EXPECTED_STREAMFLOW_VERSION,
};

const parsed = envSchema.safeParse(raw);

if (!parsed.success) {
  console.error("\n❌ Invalid environment variables:\n");
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error(
    "\nCheck your .env.local against .env.example. Restart `pnpm dev` after fixes.\n",
  );
  throw new Error("Invalid environment variables — see console.");
}

export const env = parsed.data;
export type Network = "devnet" | "mainnet";
