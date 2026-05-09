import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ListingStatus, BidStatus } from "@/types/domain";

const LISTING_TONE: Record<ListingStatus, string> = {
  LISTED: "border-brand-blue/30 text-brand-blue bg-brand-ice/45",
  SETTLED: "border-brand-violet/25 text-brand-violet bg-brand-violet/10",
  CANCELLED:
    "border-muted-foreground/30 text-muted-foreground bg-muted/40",
  EXPIRED: "border-muted-foreground/30 text-muted-foreground bg-muted/40",
};

const BID_TONE: Record<BidStatus, string> = {
  OPEN: "border-brand-blue/30 text-brand-blue bg-brand-ice/45",
  ACCEPTED: "border-brand-violet/25 text-brand-violet bg-brand-violet/10",
  WITHDRAWN:
    "border-muted-foreground/30 text-muted-foreground bg-muted/40",
};

interface StatusBadgeProps {
  status: ListingStatus | BidStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const tone =
    status in LISTING_TONE
      ? LISTING_TONE[status as ListingStatus]
      : BID_TONE[status as BidStatus];

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-pill font-mono text-[10px] uppercase tracking-[0.08em] px-2 py-0",
        tone,
        className,
      )}
    >
      {status}
    </Badge>
  );
}
