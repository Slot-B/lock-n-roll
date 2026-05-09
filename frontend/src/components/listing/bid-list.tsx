import { Card } from "@/components/ui/card";
import { PdaDisplay } from "@/components/domain/pda-display";
import { DiscountBadge } from "@/components/domain/discount-badge";
import {
  formatPricePerToken,
  formatUsdc,
  microUsdcToUsd,
} from "@/lib/format";
import type { Bid, ListingView } from "@/types/domain";

interface BidListProps {
  listing: ListingView;
  bids: Bid[];
}

export function BidList({ listing, bids }: BidListProps) {
  const market = listing.token.marketPriceUsd;

  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-sm uppercase tracking-normal">
          Current Bids
          <span className="ml-2 text-muted-foreground">({bids.length})</span>
        </h2>
        {bids.length > 0 && (
          <span className="font-mono text-[11px] text-muted-foreground">
            sorted highest first
          </span>
        )}
      </div>

      {bids.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No open bids yet — be the first to make an offer.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {bids.map((bid, idx) => {
            const usd = microUsdcToUsd(bid.pricePerTokenMicroUsdc);
            const discount =
              market && market > 0 ? Math.max(0, 1 - usd / market) : undefined;
            return (
              <li
                key={bid.bidPda}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-[10px] text-muted-foreground w-4 tabular-nums">
                    {idx + 1}
                  </span>
                  <PdaDisplay value={bid.bidderWallet} />
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="font-mono text-sm tabular-nums">
                    {formatPricePerToken(bid.pricePerTokenMicroUsdc)}
                  </span>
                  {discount !== undefined && (
                    <DiscountBadge rate={discount} size="sm" />
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums hidden sm:inline">
                    {formatUsdc(bid.totalUsdcRaw)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
