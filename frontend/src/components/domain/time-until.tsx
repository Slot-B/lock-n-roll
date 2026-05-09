import { cn } from "@/lib/utils";

interface TimeUntilProps {
  /** Target timestamp, ISO 8601. */
  iso: string;
  /** Tooltip prefix, e.g. "Unlock", "Expires". */
  label?: string;
  /** Show bare days only (no "ago" / "in" prefixing). Default true. */
  short?: boolean;
  className?: string;
}

function daysBetween(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/**
 * "182 days" / "expired" / "1 day". Tone shifts to amber when ≤7 days.
 */
export function TimeUntil({
  iso,
  label,
  short = true,
  className,
}: TimeUntilProps) {
  const days = daysBetween(iso);
  const isPast = days <= 0;
  const isUrgent = !isPast && days <= 7;

  const core = isPast
    ? "expired"
    : days === 1
      ? "1 day"
      : `${days} days`;

  const text = short || isPast ? core : `in ${core}`;

  const tone = isPast
    ? "text-muted-foreground"
    : isUrgent
      ? "text-amber-400"
      : "text-foreground";

  return (
    <span
      className={cn("font-mono tabular-nums", tone, className)}
      title={
        label
          ? `${label}: ${new Date(iso).toLocaleString()}`
          : new Date(iso).toLocaleString()
      }
    >
      {text}
    </span>
  );
}
