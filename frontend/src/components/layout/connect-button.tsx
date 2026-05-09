"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortAddress } from "@/lib/format";

/**
 * Wallet connect / disconnect pill button.
 * Replaces the default WalletMultiButton so we can match the Neon design
 * system without `!important` overrides on the wallet-adapter UI.
 */
export function ConnectButton() {
  const { publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  if (publicKey) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="rounded-pill font-mono text-xs gap-2"
        onClick={() => void disconnect()}
        title="Disconnect wallet"
      >
        <span className="h-2 w-2 rounded-full bg-brand-violet" aria-hidden />
        {shortAddress(publicKey.toBase58())}
        <LogOut className="h-3 w-3 opacity-70" />
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      className="rounded-pill gap-2"
      onClick={() => setVisible(true)}
      disabled={connecting}
    >
      <Wallet className="h-3.5 w-3.5" />
      {connecting ? "Connecting…" : "Connect Wallet"}
    </Button>
  );
}
