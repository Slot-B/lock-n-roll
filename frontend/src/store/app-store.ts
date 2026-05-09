"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_NETWORK } from "@/lib/network";
import type { Network } from "@/lib/env";

/**
 * Tx lifecycle phases — shared across Buy Now, Bid, Cancel, etc.
 * Order matches the spec §5.4 "Transaction in progress" row.
 */
export type TxPhase =
  | "idle"
  | "building"
  | "awaiting_signature"
  | "sent"
  | "confirming"
  | "confirmed"
  | "failed";

export interface TxStatus {
  phase: TxPhase;
  /** Tx signature once submitted; allows linking to Solscan. */
  signature?: string;
  /** Error message when phase === "failed". */
  error?: string;
  /** Short human-readable label, e.g. "Creating listing", "Buying JTO". */
  label?: string;
}

interface AppState {
  // ── Network
  network: Network;
  setNetwork: (n: Network) => void;

  // ── Active transaction
  tx: TxStatus;
  setTx: (s: TxStatus) => void;
  resetTx: () => void;
}

const IDLE_TX: TxStatus = { phase: "idle" };

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      network: DEFAULT_NETWORK,
      setNetwork: (network) => set({ network }),

      tx: IDLE_TX,
      setTx: (tx) => set({ tx }),
      resetTx: () => set({ tx: IDLE_TX }),
    }),
    {
      name: "lnr-app-state",
      // `createJSONStorage`'s factory is invoked lazily on the client; on the
      // server we hand back `undefined` so persist is effectively disabled
      // until hydration.
      storage:
        typeof window === "undefined"
          ? undefined
          : createJSONStorage(() => localStorage),
      // Only persist user network choice. `tx` is ephemeral.
      partialize: (state) => ({ network: state.network }),
    },
  ),
);
