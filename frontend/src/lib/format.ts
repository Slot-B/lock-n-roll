/**
 * Formatting helpers used across the app.
 * On-chain integer types (vesting amount, USDC) are passed in as decimal
 * strings or bigints — never `number` — to avoid precision loss.
 */

/** "9xKj…3mF9" — base58 pubkey or signature shortener for display. */
export function shortAddress(s: string, head = 4, tail = 4): string {
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** "1,234.56" with thousands separators, max 6 decimals by default. */
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

/** Convert micro-USDC string to a JS number (USD). Lossy at very large amounts. */
export function microUsdcToUsd(micro: string | bigint): number {
  const big = typeof micro === "bigint" ? micro : BigInt(micro);
  // Number(big) / 1_000_000 keeps 6 decimals safely for any UI-relevant amount.
  return Number(big) / 1_000_000;
}

/** Per-token price: "$2.05" (3-7 sig digits depending on magnitude). */
export function formatPricePerToken(micro: string | bigint): string {
  const usd = microUsdcToUsd(micro);
  if (usd === 0) return "$0";
  const fractionDigits = usd >= 1 ? 4 : usd >= 0.001 ? 6 : 9;
  return `$${formatNumber(usd, {
    minimumFractionDigits: usd >= 1 ? 2 : 0,
    maximumFractionDigits: fractionDigits,
  })}`;
}

/** "50,000" — integer token amount from raw_amount + decimals. */
export function formatTokenAmount(
  rawAmount: string | bigint,
  decimals: number,
  options: { fractionDigits?: number } = {},
): string {
  const big =
    typeof rawAmount === "bigint" ? rawAmount : BigInt(rawAmount || "0");
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = big / divisor;
  const frac = big % divisor;
  const wholeStr = formatNumber(whole.toString());
  if (frac === 0n || decimals === 0) return wholeStr;
  const target = options.fractionDigits ?? Math.min(2, decimals);
  if (target <= 0) return wholeStr;
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, target)
    .replace(/0+$/, "");
  return fracStr ? `${wholeStr}.${fracStr}` : wholeStr;
}

/** "-35.1%" formatted for a discount_rate fraction (0–1). */
export function formatDiscount(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}
