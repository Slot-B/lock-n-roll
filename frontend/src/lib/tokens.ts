import type { Token } from "@/types/domain";

/**
 * Canonical token catalog. Used by mock data + as a fallback when the
 * Jupiter API integration (FE8) is offline.
 *
 * Logos are CoinGecko CDN URLs (stable, allow hotlinking).
 * Mainnet mint addresses are the real ones; on Devnet you'd point to your
 * own test mints, but we keep symbols/decimals identical for parity.
 */
export const TOKENS = {
  JTO: {
    mint: "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
    symbol: "JTO",
    name: "Jito",
    decimals: 9,
    logoUrl:
      "https://coin-images.coingecko.com/coins/images/33228/large/jto.png",
    marketPriceUsd: 3.42,
  },
  BONK: {
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    symbol: "BONK",
    name: "Bonk",
    decimals: 5,
    logoUrl:
      "https://coin-images.coingecko.com/coins/images/28600/large/bonk.jpg",
    marketPriceUsd: 0.000031,
  },
  WEN: {
    mint: "WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk",
    symbol: "WEN",
    name: "Wen",
    decimals: 5,
    logoUrl:
      "https://coin-images.coingecko.com/coins/images/34856/large/wen-logo-new.jpg",
    marketPriceUsd: 0.00012,
  },
  JUP: {
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    symbol: "JUP",
    name: "Jupiter",
    decimals: 6,
    logoUrl:
      "https://coin-images.coingecko.com/coins/images/34188/large/jup.png",
    marketPriceUsd: 0.92,
  },
  PYTH: {
    mint: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    symbol: "PYTH",
    name: "Pyth Network",
    decimals: 6,
    logoUrl:
      "https://coin-images.coingecko.com/coins/images/31924/large/pyth.png",
    marketPriceUsd: 0.18,
  },
  DRIFT: {
    mint: "DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7",
    symbol: "DRIFT",
    name: "Drift",
    decimals: 6,
    logoUrl:
      "https://coin-images.coingecko.com/coins/images/37509/large/DRIFT.png",
    marketPriceUsd: 0.85,
  },
  RAY: {
    mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    symbol: "RAY",
    name: "Raydium",
    decimals: 6,
    logoUrl:
      "https://coin-images.coingecko.com/coins/images/13928/large/PSigc4ie_400x400.jpg",
    marketPriceUsd: 1.92,
  },
  ORCA: {
    mint: "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
    symbol: "ORCA",
    name: "Orca",
    decimals: 6,
    logoUrl:
      "https://coin-images.coingecko.com/coins/images/17547/large/Orca_Logo.png",
    marketPriceUsd: 2.34,
  },
} satisfies Record<string, Token>;

export const TOKEN_LIST: Token[] = Object.values(TOKENS);

const TOKENS_BY_MINT: Record<string, Token> = Object.fromEntries(
  TOKEN_LIST.map((t) => [t.mint, t]),
);

export function getToken(mint: string): Token | undefined {
  return TOKENS_BY_MINT[mint];
}

/** Throws if mint unknown — for places that should never miss. */
export function requireToken(mint: string): Token {
  const t = TOKENS_BY_MINT[mint];
  if (!t) throw new Error(`Unknown token mint: ${mint}`);
  return t;
}
