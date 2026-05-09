import { MarketHero } from "@/components/market/market-hero";
import { MarketContent } from "@/components/market/market-content";
import { SettledDealsTable } from "@/components/market/settled-deals-table";
import {
  MOCK_ACTIVE_LISTING_VIEWS,
  MOCK_RECENT_TRADES,
} from "@/lib/mock";

export default function MarketPage() {
  // M1: served from local mock fixtures. M3 will swap to /orders + react-query.
  const listings = MOCK_ACTIVE_LISTING_VIEWS;
  const trades = MOCK_RECENT_TRADES;

  return (
    <>
      <MarketHero
        activeCount={listings.length}
        settledCount={trades.length}
      />
      <div className="mx-auto max-w-7xl px-6 py-10 space-y-12">
        <MarketContent listings={listings} />
        <SettledDealsTable trades={trades} />
      </div>
    </>
  );
}
