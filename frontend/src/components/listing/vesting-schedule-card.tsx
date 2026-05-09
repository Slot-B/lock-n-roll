import { Card } from "@/components/ui/card";
import { TimeUntil } from "@/components/domain/time-until";
import type { ListingView } from "@/types/domain";

interface VestingScheduleCardProps {
  listing: ListingView;
}

/**
 * Visualizes the vesting timeline. M1 keeps it as a simple progress bar
 * between createdAt and unlockAt; M2 will pull cliff/period from the actual
 * Streamflow contract.
 */
export function VestingScheduleCard({ listing }: VestingScheduleCardProps) {
  const created = new Date(listing.createdAt).getTime();
  const unlock = new Date(listing.unlockAt).getTime();
  const now = Date.now();
  const total = Math.max(1, unlock - created);
  const elapsed = Math.max(0, Math.min(total, now - created));
  const progressPct = (elapsed / total) * 100;

  return (
    <Card className="p-5">
      <h2 className="font-display text-sm uppercase tracking-normal">
        Vesting Schedule
      </h2>

      <div className="mt-5 space-y-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Listed</span>
          <span className="text-muted-foreground">Unlocks</span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-pill bg-secondary">
          <div
            className="h-full bg-brand-violet/70"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-baseline justify-between font-mono text-[11px]">
          <span className="text-muted-foreground tabular-nums">
            {new Date(listing.createdAt).toISOString().slice(0, 10)}
          </span>
          <span className="tabular-nums">
            {new Date(listing.unlockAt).toISOString().slice(0, 10)}
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Time until unlock</span>
        <TimeUntil iso={listing.unlockAt} label="Unlock date" />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Listing expires</span>
        <TimeUntil iso={listing.expiresAt} label="Expiry" />
      </div>
    </Card>
  );
}
