import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { TokenIcon } from "@/components/domain/token-icon";
import { StatusBadge } from "@/components/domain/status-badge";
import { PdaDisplay } from "@/components/domain/pda-display";
import { formatNumber } from "@/lib/format";
import type { ListingView } from "@/types/domain";

interface TokenHeaderProps {
  listing: ListingView;
}

export function TokenHeader({ listing }: TokenHeaderProps) {
  const { token, status } = listing;
  return (
    <div className="space-y-4">
      <Link
        href="/market"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Market
      </Link>

      <div className="flex items-start gap-5">
        <TokenIcon token={token} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight">
              {token.symbol}
            </h1>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{token.name}</p>
          {token.marketPriceUsd !== undefined && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              Market price:{" "}
              <span className="text-foreground">
                ${formatNumber(token.marketPriceUsd, {
                  maximumFractionDigits: 6,
                })}
              </span>
              <span className="ml-2 text-muted-foreground/70">via Pyth</span>
            </p>
          )}
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Maker:{" "}
            <PdaDisplay value={listing.makerWallet} />
          </p>
        </div>
      </div>
    </div>
  );
}
