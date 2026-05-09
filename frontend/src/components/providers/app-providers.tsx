"use client";

import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";

import { useAppStore } from "@/store/app-store";
import { getNetworkConfig } from "@/lib/network";

// Wallet UI default styles. We override the modal in globals.css later.
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Tree of all client-side providers needed before any UI renders.
 *
 * Layering:
 *   QueryClientProvider
 *     ConnectionProvider (network-aware via Zustand)
 *       WalletProvider (autoConnect)
 *         WalletModalProvider
 *           {children}
 *
 * Network changes mutate `endpoint` → React reconnects automatically.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const network = useAppStore((s) => s.network);
  const config = useMemo(() => getNetworkConfig(network), [network]);

  // Explicit adapters as a fallback for wallets that do not implement
  // the Wallet Standard. Wallets that do (Phantom, Solflare on recent
  // versions, Backpack, etc.) are auto-detected even with an empty list.
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  // Single QueryClient instance per app. `staleTime: 60s` matches the
  // Redis cache TTL on the backend (spec §4.3) so we don't refetch
  // immediately after the cache hits.
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={config.rpcUrl}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            {children}
            <Toaster richColors theme="light" position="top-right" />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
