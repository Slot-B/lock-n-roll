"use client";

import { useMemo, useState } from "react";
import { MarketFilters, type MarketSort } from "./market-filters";
import { ListingGrid } from "./listing-grid";
import type { ListingView } from "@/types/domain";

interface MarketContentProps {
  listings: ListingView[];
}

/**
 * Client wrapper that owns filter/sort state for the market view.
 * Keeps `MarketPage` itself a server component so the hero + settled-deals
 * table stay in the static prerender path.
 */
export function MarketContent({ listings }: MarketContentProps) {
  const [search, setSearch] = useState("");
  const [buyNowOnly, setBuyNowOnly] = useState(false);
  const [sort, setSort] = useState<MarketSort>("discount");

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    const filtered = listings.filter((l) => {
      if (buyNowOnly && !l.hasAsking) return false;
      if (s && !l.token.symbol.toLowerCase().includes(s)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      switch (sort) {
        case "discount":
          return (b.bestDiscountRate ?? 0) - (a.bestDiscountRate ?? 0);
        case "newest":
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case "unlock-soon":
          return a.daysUntilUnlock - b.daysUntilUnlock;
      }
    });
  }, [listings, search, buyNowOnly, sort]);

  return (
    <div className="space-y-6">
      <MarketFilters
        search={search}
        onSearchChange={setSearch}
        buyNowOnly={buyNowOnly}
        onBuyNowToggle={setBuyNowOnly}
        sort={sort}
        onSortChange={setSort}
        resultCount={visible.length}
      />
      <ListingGrid listings={visible} />
    </div>
  );
}
