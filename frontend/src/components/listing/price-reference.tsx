import { Card } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import type { ListingView } from "@/types/domain";

interface PriceReferenceProps {
  listing: ListingView;
  /** Average discount across recent similar trades, for context. M3 will compute. */
  similarDiscountRange?: { min: number; max: number };
}

export function PriceReference({
  listing,
  similarDiscountRange,
}: PriceReferenceProps) {
  const market = listing.token.marketPriceUsd;
  return (
    <Card className="p-5 bg-card border-border">
      <h2 className="font-display text-sm uppercase tracking-wider">
        Price Reference
      </h2>
      <dl className="mt-4 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Market price</dt>
          <dd className="font-mono tabular-nums">
            {market !== undefined
              ? `$${formatNumber(market, { maximumFractionDigits: 6 })}`
              : "—"}
            <span className="ml-1 text-muted-foreground/70">(Pyth)</span>
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">24h change</dt>
          <dd className="font-mono tabular-nums text-muted-foreground">—</dd>
        </div>
        {similarDiscountRange && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Similar deals</dt>
            <dd className="font-mono tabular-nums text-foreground">
              −{(similarDiscountRange.min * 100).toFixed(0)}% ~ −
              {(similarDiscountRange.max * 100).toFixed(0)}%
            </dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
