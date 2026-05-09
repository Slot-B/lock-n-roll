/**
 * Formatting helpers used by Header, ListingCard, BidPanel, etc.
 */

/** "9xKj…3mF9" — base58 pubkey or signature shortener for display. */
export function shortAddress(s: string, head = 4, tail = 4): string {
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** "1,234.56" with thousands separators, max 6 decimals. */
export function formatNumber(
  v: number | string | bigint,
  options: Intl.NumberFormatOptions = {},
): string {
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
    ...options,
  }).format(n);
}

/** "$1,234.56" — USDC display from raw integer micro-USDC (6 decimals). */
export function formatUsdc(rawMicro: bigint | string): string {
  const big = typeof rawMicro === "bigint" ? rawMicro : BigInt(rawMicro);
  const whole = big / 1_000_000n;
  const frac = big % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return `$${formatNumber(whole.toString())}${fracStr ? `.${fracStr}` : ""}`;
}

/** "-35.1%" formatted for a discount_rate fraction (0–1). */
export function formatDiscount(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
