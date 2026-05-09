import { notFound } from "next/navigation";

import { TokenHeader } from "@/components/listing/token-header";
import { EscrowInfo } from "@/components/listing/escrow-info";
import { VestingScheduleCard } from "@/components/listing/vesting-schedule-card";
import { BidList } from "@/components/listing/bid-list";
import { PriceReference } from "@/components/listing/price-reference";
import { DualCTAPanel } from "@/components/listing/dual-cta-panel";
import {
  getMockListingViewByPda,
  getMockOpenBidsForListing,
} from "@/lib/mock";

interface ListingDetailPageProps {
  params: { pda: string };
}

export default function ListingDetailPage({ params }: ListingDetailPageProps) {
  const listing = getMockListingViewByPda(params.pda);
  if (!listing) notFound();

  const bids = getMockOpenBidsForListing(listing.listingPda);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left: 2/3 details */}
        <div className="lg:col-span-2 space-y-6">
          <TokenHeader listing={listing} />
          <EscrowInfo listing={listing} />
          <VestingScheduleCard listing={listing} />
          <BidList listing={listing} bids={bids} />
        </div>

        {/* Right: 1/3 actions + reference */}
        <div className="space-y-6">
          <DualCTAPanel listing={listing} />
          <PriceReference listing={listing} />
        </div>
      </div>
    </div>
  );
}
