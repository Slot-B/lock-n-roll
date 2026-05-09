"use client";

import { Check, ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import type { Network } from "@/lib/env";

const NETWORKS: ReadonlyArray<{
  value: Network;
  label: string;
  /** Tailwind text-color class for the dot + label, signals environment. */
  tone: string;
}> = [
  { value: "devnet", label: "Devnet", tone: "text-brand-violet" },
  { value: "mainnet", label: "Mainnet", tone: "text-brand-blue" },
];

export function NetworkToggle() {
  const network = useAppStore((s) => s.network);
  const setNetwork = useAppStore((s) => s.setNetwork);
  const active = NETWORKS.find((n) => n.value === network) ?? NETWORKS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "rounded-pill font-mono text-xs gap-1.5",
          active.tone,
        )}
      >
        <span aria-hidden>●</span>
        {active.label}
        <ChevronDown className="h-3 w-3 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {NETWORKS.map((n) => (
          <DropdownMenuItem
            key={n.value}
            onClick={() => setNetwork(n.value)}
            className="font-mono text-xs cursor-pointer"
          >
            <span className={n.tone} aria-hidden>
              ●
            </span>
            <span className="ml-2">{n.label}</span>
            {n.value === network && (
              <Check className="ml-auto h-3 w-3 opacity-70" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
