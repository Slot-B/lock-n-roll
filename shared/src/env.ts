export type Network = "localnet" | "devnet" | "mainnet";

export interface NetworkConfig {
  LOCK_N_ROLL_PROGRAM_ID: string;
  STREAMFLOW_PROGRAM_ID: string;
  USDC_MINT: string;
  EXPECTED_STREAMFLOW_VERSION: number;
  RPC_URL: string;
}

export const ENV: Record<Network, NetworkConfig> = {
  localnet: {
    LOCK_N_ROLL_PROGRAM_ID: "7Q54xcKeDKLzFSymQpa6WxyFcyQGo5ebvaUbrGkKVZBc",
    STREAMFLOW_PROGRAM_ID: "STREAMFLOW_LOCAL_MOCK",
    USDC_MINT: "USDC_LOCAL_TEST_MINT_TBD",
    EXPECTED_STREAMFLOW_VERSION: 4,
    RPC_URL: "http://127.0.0.1:8899",
  },
  devnet: {
    LOCK_N_ROLL_PROGRAM_ID: "9PR9oNvarS2iektAP84Zdcs4akh3a2NML8XVw75ih4gu",
    STREAMFLOW_PROGRAM_ID: "HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ",
    USDC_MINT: "USDC_DEVNET_SELF_MINT_TBD",
    EXPECTED_STREAMFLOW_VERSION: 4,
    RPC_URL: "https://api.devnet.solana.com",
  },
  mainnet: {
    LOCK_N_ROLL_PROGRAM_ID: "MAINNET_LNR_PROGRAM_ID_TBD",
    STREAMFLOW_PROGRAM_ID: "strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m",
    USDC_MINT: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    EXPECTED_STREAMFLOW_VERSION: 4,
    RPC_URL: "https://api.mainnet-beta.solana.com",
  },
};

export function getNetworkConfig(network: Network): NetworkConfig {
  return ENV[network];
}
