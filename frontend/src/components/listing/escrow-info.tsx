import { Card } from "@/components/ui/card";
import { PdaDisplay } from "@/components/domain/pda-display";
import { formatTokenAmount } from "@/lib/format";
import type { ListingView } from "@/types/domain";

interface EscrowInfoProps {
  listing: ListingView;
}

export function EscrowInfo({ listing }: EscrowInfoProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-brand-blue" aria-hidden />
        <h2 className="font-display text-sm uppercase tracking-wider">
          Streamflow Recipient · Verified On-Chain
        </h2>
      </div>

      <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
        Tokens stay locked in the original Streamflow vesting contract.
        On-chain, the listing PDA holds the recipient right and will pass it
        to the buyer atomically with USDC settlement.
      </p>

      <dl className="mt-5 grid grid-cols-1 gap-y-3 sm:grid-cols-2">
        <Field label="Listed Amount">
          <span className="font-mono text-base tabular-nums">
            {formatTokenAmount(listing.vestingAmountRaw, listing.tokenDecimals)}{" "}
            <span className="text-muted-foreground text-xs">
              {listing.token.symbol}
            </span>
          </span>
        </Field>
        <Field label="Streamflow Contract">
          <PdaDisplay value={listing.streamflowMetadata} />
        </Field>
        <Field label="Listing PDA">
          <PdaDisplay value={listing.listingPda} />
        </Field>
        <Field label="Vesting Recipient">
          <span className="font-mono text-xs text-brand-blue">listing_pda</span>
        </Field>
      </dl>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
