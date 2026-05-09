import { PublicKey } from "@solana/web3.js";
import { env, type Network } from "./env";

/**
 * All chain-level constants resolved for a single network.
 * `lockNRollProgramId` is `null` until `anchor deploy` fills the env var.
 */
export interface NetworkConfig {
  network: Network;
  rpcUrl: string;
  lockNRollProgramId: PublicKey | null;
  streamflowProgramId: PublicKey;
  usdcMint: PublicKey;
}

const cache: Partial<Record<Network, NetworkConfig>> = {};

export function getNetworkConfig(network: Network): NetworkConfig {
  const hit = cache[network];
  if (hit) return hit;

  const config: NetworkConfig =
    network === "devnet"
      ? {
          network,
          rpcUrl: env.NEXT_PUBLIC_DEVNET_RPC_URL,
          lockNRollProgramId: env.NEXT_PUBLIC_LOCK_N_ROLL_DEVNET_ID
            ? new PublicKey(env.NEXT_PUBLIC_LOCK_N_ROLL_DEVNET_ID)
            : null,
          streamflowProgramId: new PublicKey(
            env.NEXT_PUBLIC_STREAMFLOW_DEVNET_ID,
          ),
          usdcMint: new PublicKey(env.NEXT_PUBLIC_USDC_DEVNET_MINT),
        }
      : {
          network,
          rpcUrl: env.NEXT_PUBLIC_MAINNET_RPC_URL,
          lockNRollProgramId: env.NEXT_PUBLIC_LOCK_N_ROLL_MAINNET_ID
            ? new PublicKey(env.NEXT_PUBLIC_LOCK_N_ROLL_MAINNET_ID)
            : null,
          streamflowProgramId: new PublicKey(
            env.NEXT_PUBLIC_STREAMFLOW_MAINNET_ID,
          ),
          usdcMint: new PublicKey(env.NEXT_PUBLIC_USDC_MAINNET_MINT),
        };

  cache[network] = config;
  return config;
}

export const DEFAULT_NETWORK: Network = env.NEXT_PUBLIC_NETWORK;
