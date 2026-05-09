import Link from "next/link";
import { Zap } from "lucide-react";

import { Card } from "@/components/ui/card";
import { TokenIcon } from "@/components/domain/token-icon";
import { DiscountBadge } from "@/components/domain/discount-badge";
import { TimeUntil } from "@/components/domain/time-until";
import {
  formatTokenAmount,
  formatPricePerToken,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ListingView } from "@/types/domain";

interface ListingCardProps {
  listing: ListingView;
  className?: string;
}

/**
 * Card view of a listing on the /market grid.
 * Always-visible info hierarchy (top → bottom):
 *   1. Token identity (logo + symbol/name)
 *   2. Vesting amount
 *   3. Time info (unlock date + days remaining)
 *   4. Price hierarchy: Buy Now (if asking) > best Bid > "no bids yet"
 *   5. Trust badge — Streamflow Recipient
 */
export function ListingCard({ listing, className }: ListingCardProps) {
  const { token, hasAsking, bidCount, bestDiscountRate } = listing;

  return (
    <Link
      href={`/market/${listing.listingPda}`}
      className={cn(
        "group block transition-colors",
        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 rounded-2xl",
        className,
      )}
    >
      <Card className="relative h-full p-5 hover:border-brand-blue/50 transition-colors">
        {/* Buy Now badge (top-right) */}
        {hasAsking && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-pill bg-brand-violet/12 text-brand-violet px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider">
            <Zap className="h-2.5 w-2.5" />
            Buy Now
          </span>
        )}

        {/* 1. Token identity */}
        <div className="flex items-center gap-3">
          <TokenIcon token={token} size={36} />
          <div className="min-w-0">
            <div className="font-display text-lg leading-tight tracking-normal">
              {token.symbol}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {token.name}
            </div>
          </div>
        </div>

        {/* 2. Vesting amount */}
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Listed Amount
          </div>
          <div className="mt-0.5 font-mono text-2xl tabular-nums">
            {formatTokenAmount(listing.vestingAmountRaw, listing.tokenDecimals)}{" "}
            <span className="text-sm text-muted-foreground">
              {token.symbol}
            </span>
          </div>
        </div>

        {/* 3. Time info */}
        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Unlock</span>
          <TimeUntil
            iso={listing.unlockAt}
            label="Unlock date"
            className="text-xs"
          />
        </div>

        {/* 4. Price block */}
        <div className="mt-4 border-t border-border pt-4 space-y-2">
          {hasAsking && listing.askingPriceMicroUsdc && (
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Buy Now</span>
              <span className="font-mono text-base tabular-nums">
                {formatPricePerToken(listing.askingPriceMicroUsdc)}
              </span>
            </div>
          )}
          {listing.bestBidPriceMicroUsdc && (
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Best Bid</span>
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {formatPricePerToken(listing.bestBidPriceMicroUsdc)}
              </span>
            </div>
          )}
          {!hasAsking && !listing.bestBidPriceMicroUsdc && (
            <div className="text-xs text-muted-foreground">
              No bids yet — be first
            </div>
          )}
          {bestDiscountRate !== undefined && bestDiscountRate > 0 && (
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                vs Market
              </span>
              <DiscountBadge rate={bestDiscountRate} />
            </div>
          )}
        </div>

        {/* 5. Footer: bid count + trust */}
        <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {bidCount} {bidCount === 1 ? "bid" : "bids"}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" aria-hidden />
            Streamflow Recipient
          </span>
        </div>
      </Card>
    </Link>
  );
}
