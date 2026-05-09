import { ListingCard } from "@/components/domain/listing-card";
import type { ListingView } from "@/types/domain";

interface ListingGridProps {
  listings: ListingView[];
}

export function ListingGrid({ listings }: ListingGridProps) {
  if (listings.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/40 p-12 text-center">
        <p className="font-display text-xl">No listings match your filters.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Try clearing search, disabling Buy Now Only, or check back later.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((l) => (
        <ListingCard key={l.listingPda} listing={l} />
      ))}
    </div>
  );
}
