import { cn } from "@/lib/utils";
import { formatDiscount } from "@/lib/format";

interface DiscountBadgeProps {
  /** Fraction in [0, 1]. 0.35 → "−35.0%". */
  rate: number;
  /** Use larger typography. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Discount delta vs market price. Color signals attractiveness:
 * - >= 30% → brand violet
 * - >= 10% → amber
 * - <  10% → muted
 */
export function DiscountBadge({
  rate,
  size = "md",
  className,
}: DiscountBadgeProps) {
  const tone =
    rate >= 0.3
      ? "text-brand-violet"
      : rate >= 0.1
        ? "text-brand-blue"
        : "text-muted-foreground";

  const fontSize =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-xs" : "text-sm";

  return (
    <span
      className={cn(
        "font-mono font-semibold tabular-nums",
        fontSize,
        tone,
        className,
      )}
    >
      −{formatDiscount(rate)}
    </span>
  );
}
