interface ListingDetailPageProps {
  params: { pda: string };
}

export default function ListingDetailPage({ params }: ListingDetailPageProps) {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <h1 className="font-display text-4xl tracking-tight">Listing</h1>
      <p className="mt-2 font-mono text-xs text-muted-foreground break-all">
        {params.pda}
      </p>
      <p className="mt-2 text-muted-foreground">
        Listing detail with bids and Streamflow metadata. Coming in M1.
      </p>
    </div>
  );
}
