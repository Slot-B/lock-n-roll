"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import type { Adapter } from "@solana/wallet-adapter-base";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";

import { useAppStore } from "@/store/app-store";
import { getNetworkConfig } from "@/lib/network";

// Wallet UI default styles. We override the modal in globals.css later.
import "@solana/wallet-adapter-react-ui/styles.css";

// WalletModalProvider (and the modal it renders) lives in a separate
// chunk so it does not block first paint. `useWalletModal()` from the
// same package returns a safe no-op default until the chunk arrives,
// so the Connect button is inert for a frame on cold load.
const WalletModalProvider = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletModalProvider,
    ),
  { ssr: false },
);

/**
 * Tree of all client-side providers needed before any UI renders.
 *
 * Layering:
 *   QueryClientProvider
 *     ConnectionProvider (network-aware via Zustand)
 *       WalletProvider (autoConnect)
 *         WalletModalProvider (dynamic, client-only)
 *           {children}
 *
 * Network changes mutate `endpoint` → React reconnects automatically.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const network = useAppStore((s) => s.network);
  const config = useMemo(() => getNetworkConfig(network), [network]);

  // Adapter constructors are loaded after hydration so the
  // wallet-adapter-wallets bundle (which pulls in adapters for many
  // chains) does not enter the initial JS chunk. Wallet Standard
  // wallets are auto-detected even with an empty starting list.
  const [wallets, setWallets] = useState<Adapter[]>([]);

  useEffect(() => {
    let canceled = false;
    void import("@solana/wallet-adapter-wallets").then((mod) => {
      if (canceled) return;
      setWallets([
        new mod.PhantomWalletAdapter(),
        new mod.SolflareWalletAdapter(),
      ]);
    });
    return () => {
      canceled = true;
    };
  }, []);

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
