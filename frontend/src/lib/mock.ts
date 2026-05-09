import type {
  Listing,
  ListingView,
  Bid,
  BidWithRefund,
  Trade,
} from "@/types/domain";
import { TOKENS, requireToken } from "./tokens";

// ─── Helpers ────────────────────────────────────────────────────────────

/** Days from now → ISO string. */
const days = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

/** `count * 10^decimals` as decimal string for `vestingAmountRaw`. */
const tokenAmount = (whole: number, decimals: number): string =>
  (BigInt(whole) * BigInt(10) ** BigInt(decimals)).toString();

/** USDC dollars → micro-USDC string (6 decimals). */
const microUsdc = (dollars: number): string =>
  Math.round(dollars * 1_000_000).toString();

/** Days between now and an ISO timestamp; negative → past. */
const daysUntil = (iso: string): number =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

/** Discount rate from price_per_token (USD) and market price (USD). */
const discount = (pricePerTokenUsd: number, marketUsd: number): number =>
  Math.max(0, Math.min(1, 1 - pricePerTokenUsd / marketUsd));

// ─── Wallet fixtures ───────────────────────────────────────────────────

export const MOCK_WALLETS = {
  alice: "9xKj3vHm2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP9vQ7tA",
  bob: "BxKj3vHm2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP9vQ7tB",
  carol: "CxKj3vHm2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP9vQ7tC",
  dave: "DxKj3vHm2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP9vQ7tD",
  /** "Me" — used for dashboard view. */
  me: "MxKj3vHm2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP9vQ7tM",
} as const;

// ─── Listings (6 covering all states + buy-now/bid-only mix) ───────────

export const MOCK_LISTINGS: Listing[] = [
  // 1. JTO — LISTED, asking + 3 bids → most attractive view
  {
    listingPda: "L1JTOpq5tNb4xRsW8Yj1cF2dG6hM3kP9vQ7tA9xKj3v",
    makerWallet: MOCK_WALLETS.alice,
    streamflowMetadata: "S1JTOpq5tNb4xRsW8Yj1cF2dG6hM3kP9vQ7tA9xKj3v",
    tokenMint: TOKENS.JTO.mint,
    tokenDecimals: TOKENS.JTO.decimals,
    vestingAmountRaw: tokenAmount(50_000, TOKENS.JTO.decimals),
    unlockAt: days(182),
    askingPriceMicroUsdc: microUsdc(2.2), // -35.7% vs 3.42
    expiresAt: days(30),
    status: "LISTED",
    bidCount: 3,
    bestBidPriceMicroUsdc: microUsdc(2.05), // -40.1%
    createdAt: days(-2),
  },
  // 2. BONK — LISTED, asking only (no bids yet)
  {
    listingPda: "L2BONKKj3vHm2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP",
    makerWallet: MOCK_WALLETS.bob,
    streamflowMetadata: "S2BONKKj3vHm2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP",
    tokenMint: TOKENS.BONK.mint,
    tokenDecimals: TOKENS.BONK.decimals,
    vestingAmountRaw: tokenAmount(1_200_000, TOKENS.BONK.decimals),
    unlockAt: days(90),
    askingPriceMicroUsdc: microUsdc(0.0000242), // -22%
    expiresAt: days(14),
    status: "LISTED",
    bidCount: 0,
    createdAt: days(-1),
  },
  // 3. WEN — LISTED, bid-only (no asking), 1 bid
  {
    listingPda: "L3WENXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pP",
    makerWallet: MOCK_WALLETS.carol,
    streamflowMetadata: "S3WENXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pP",
    tokenMint: TOKENS.WEN.mint,
    tokenDecimals: TOKENS.WEN.decimals,
    vestingAmountRaw: tokenAmount(500_000, TOKENS.WEN.decimals),
    unlockAt: days(365),
    askingPriceMicroUsdc: undefined,
    expiresAt: days(45),
    status: "LISTED",
    bidCount: 1,
    bestBidPriceMicroUsdc: microUsdc(0.000066), // -45%
    createdAt: days(-5),
  },
  // 4. JUP — LISTED, bid-only with several bids (price tension)
  {
    listingPda: "L4JUPiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDv",
    makerWallet: MOCK_WALLETS.dave,
    streamflowMetadata: "S4JUPiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDv",
    tokenMint: TOKENS.JUP.mint,
    tokenDecimals: TOKENS.JUP.decimals,
    vestingAmountRaw: tokenAmount(25_000, TOKENS.JUP.decimals),
    unlockAt: days(120),
    askingPriceMicroUsdc: undefined,
    expiresAt: days(20),
    status: "LISTED",
    bidCount: 5,
    bestBidPriceMicroUsdc: microUsdc(0.74), // -19.5%
    createdAt: days(-3),
  },
  // 5. PYTH — SETTLED via accept_bid (history view)
  {
    listingPda: "L5PYTHJovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQ",
    makerWallet: MOCK_WALLETS.alice,
    streamflowMetadata: "S5PYTHJovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQ",
    tokenMint: TOKENS.PYTH.mint,
    tokenDecimals: TOKENS.PYTH.decimals,
    vestingAmountRaw: tokenAmount(100_000, TOKENS.PYTH.decimals),
    unlockAt: days(60),
    askingPriceMicroUsdc: undefined,
    expiresAt: days(7),
    status: "SETTLED",
    bidCount: 0,
    bestBidPriceMicroUsdc: undefined,
    createdAt: days(-10),
  },
  // 6. DRIFT — CANCELLED with an OPEN bid still attached → refund-available case
  {
    listingPda: "L6DRIFTtupJYLTosbwoN8koMbEYSx54aFAVLddWsbk",
    makerWallet: MOCK_WALLETS.bob,
    streamflowMetadata: "S6DRIFTtupJYLTosbwoN8koMbEYSx54aFAVLddWsbk",
    tokenMint: TOKENS.DRIFT.mint,
    tokenDecimals: TOKENS.DRIFT.decimals,
    vestingAmountRaw: tokenAmount(15_000, TOKENS.DRIFT.decimals),
    unlockAt: days(150),
    askingPriceMicroUsdc: undefined,
    expiresAt: days(10),
    status: "CANCELLED",
    bidCount: 1,
    bestBidPriceMicroUsdc: undefined,
    createdAt: days(-8),
  },
];

// ─── Bids ───────────────────────────────────────────────────────────────

export const MOCK_BIDS: Bid[] = [
  // Bids on listing 1 (JTO)
  {
    bidPda: "B1JTO_ALICE_Bob",
    listingPda: MOCK_LISTINGS[0].listingPda,
    bidderWallet: MOCK_WALLETS.bob,
    pricePerTokenMicroUsdc: microUsdc(2.05),
    totalUsdcRaw: microUsdc(2.05 * 50_000),
    status: "OPEN",
    createdAt: days(-1),
  },
  {
    bidPda: "B2JTO_ALICE_Carol",
    listingPda: MOCK_LISTINGS[0].listingPda,
    bidderWallet: MOCK_WALLETS.carol,
    pricePerTokenMicroUsdc: microUsdc(1.95),
    totalUsdcRaw: microUsdc(1.95 * 50_000),
    status: "OPEN",
    createdAt: days(-1),
  },
  {
    bidPda: "B3JTO_ALICE_Me",
    listingPda: MOCK_LISTINGS[0].listingPda,
    bidderWallet: MOCK_WALLETS.me,
    pricePerTokenMicroUsdc: microUsdc(1.88),
    totalUsdcRaw: microUsdc(1.88 * 50_000),
    status: "OPEN",
    createdAt: days(-0),
  },
  // Bid on listing 3 (WEN, bid-only)
  {
    bidPda: "B4WEN_CAROL_Dave",
    listingPda: MOCK_LISTINGS[2].listingPda,
    bidderWallet: MOCK_WALLETS.dave,
    pricePerTokenMicroUsdc: microUsdc(0.000066),
    totalUsdcRaw: microUsdc(0.000066 * 500_000),
    status: "OPEN",
    createdAt: days(-2),
  },
  // Bid on listing 6 (DRIFT, cancelled) — refund-available scenario
  {
    bidPda: "B5DRIFT_BOB_Me",
    listingPda: MOCK_LISTINGS[5].listingPda,
    bidderWallet: MOCK_WALLETS.me,
    pricePerTokenMicroUsdc: microUsdc(0.62),
    totalUsdcRaw: microUsdc(0.62 * 15_000),
    status: "OPEN",
    createdAt: days(-7),
  },
];

// ─── Trades (settled) ──────────────────────────────────────────────────

export const MOCK_TRADES: Trade[] = [
  {
    tradeId: 1,
    txSignature: "5eW2Pz3RnG4Lj1KqVx8Xc6dAY9Jt2Mb3PqFhRsZk",
    listingPda: MOCK_LISTINGS[4].listingPda, // PYTH settled
    acceptedBidPda: "BSETTLED_PYTH_Bob",
    streamflowMetadata: MOCK_LISTINGS[4].streamflowMetadata,
    makerWallet: MOCK_LISTINGS[4].makerWallet,
    takerWallet: MOCK_WALLETS.bob,
    tokenMint: MOCK_LISTINGS[4].tokenMint,
    vestingAmountRaw: MOCK_LISTINGS[4].vestingAmountRaw,
    pricePerTokenMicroUsdc: microUsdc(0.108),
    totalUsdcRaw: microUsdc(0.108 * 100_000),
    marketPriceMicroUsdc: microUsdc(0.18),
    discountRate: discount(0.108, 0.18), // -40%
    mode: "bid",
    settledAt: days(-3),
  },
  {
    tradeId: 2,
    txSignature: "9Tz1Hx7Yj4Lq2Mn5VwBd8RcGk3PqFhRsZk5eW2Pz3R",
    listingPda: "LBOLD_PRIOR_TRADE_RAY",
    streamflowMetadata: "SBOLD_PRIOR_TRADE_RAY",
    makerWallet: MOCK_WALLETS.dave,
    takerWallet: MOCK_WALLETS.me,
    tokenMint: TOKENS.RAY.mint,
    vestingAmountRaw: tokenAmount(8_000, TOKENS.RAY.decimals),
    pricePerTokenMicroUsdc: microUsdc(1.5),
    totalUsdcRaw: microUsdc(1.5 * 8_000),
    marketPriceMicroUsdc: microUsdc(1.92),
    discountRate: discount(1.5, 1.92),
    mode: "asking",
    settledAt: days(-5),
  },
  {
    tradeId: 3,
    txSignature: "3Px9Bk2Qw7Mj1Lz4XvCd5YfHt6Nb3PqFhRsZk5eW2Pz",
    listingPda: "LBOLD_PRIOR_TRADE_ORCA",
    streamflowMetadata: "SBOLD_PRIOR_TRADE_ORCA",
    makerWallet: MOCK_WALLETS.carol,
    takerWallet: MOCK_WALLETS.alice,
    tokenMint: TOKENS.ORCA.mint,
    vestingAmountRaw: tokenAmount(3_000, TOKENS.ORCA.decimals),
    pricePerTokenMicroUsdc: microUsdc(1.65),
    totalUsdcRaw: microUsdc(1.65 * 3_000),
    marketPriceMicroUsdc: microUsdc(2.34),
    discountRate: discount(1.65, 2.34),
    mode: "bid",
    settledAt: days(-7),
  },
];

// ─── Derived UI views ──────────────────────────────────────────────────

/** Build a {@link ListingView} from raw {@link Listing}, joining token + derived fields. */
export function toListingView(listing: Listing): ListingView {
  const token = requireToken(listing.tokenMint);
  const askingUsd = listing.askingPriceMicroUsdc
    ? Number(listing.askingPriceMicroUsdc) / 1_000_000
    : undefined;
  const bidUsd = listing.bestBidPriceMicroUsdc
    ? Number(listing.bestBidPriceMicroUsdc) / 1_000_000
    : undefined;

  // Better discount = lower price for taker = MIN(asking, bestBid)
  const candidatePrice = [askingUsd, bidUsd].filter(
    (v): v is number => v !== undefined,
  );
  const bestPrice =
    candidatePrice.length > 0 ? Math.min(...candidatePrice) : undefined;
  const bestDiscountRate =
    bestPrice !== undefined && token.marketPriceUsd
      ? discount(bestPrice, token.marketPriceUsd)
      : undefined;

  return {
    ...listing,
    token,
    daysUntilUnlock: daysUntil(listing.unlockAt),
    daysUntilExpiry: daysUntil(listing.expiresAt),
    hasAsking: !!listing.askingPriceMicroUsdc,
    bestDiscountRate,
  };
}

/** Mock active listings as {@link ListingView}, for /market. */
export const MOCK_ACTIVE_LISTING_VIEWS: ListingView[] = MOCK_LISTINGS.filter(
  (l) => l.status === "LISTED",
).map(toListingView);

/** "My" view — listings + bids + refund availability for /dashboard. */
export const MOCK_MY_LISTINGS: ListingView[] = MOCK_LISTINGS.filter(
  (l) => l.makerWallet === MOCK_WALLETS.me,
).map(toListingView);

export const MOCK_MY_BIDS: BidWithRefund[] = MOCK_BIDS.filter(
  (b) => b.bidderWallet === MOCK_WALLETS.me,
).map((bid) => {
  const parent = MOCK_LISTINGS.find((l) => l.listingPda === bid.listingPda);
  const parentStatus = parent?.status ?? "EXPIRED";
  return {
    ...bid,
    parentStatus,
    refundAvailable: bid.status === "OPEN" && parentStatus !== "LISTED",
  };
});

/** Most recent settled trades for the /market settled-deals table. */
export const MOCK_RECENT_TRADES: Trade[] = [...MOCK_TRADES].sort(
  (a, b) => new Date(b.settledAt).getTime() - new Date(a.settledAt).getTime(),
);

// ─── Lookups for detail pages ───────────────────────────────────────────

export function getMockListingByPda(pda: string): Listing | undefined {
  return MOCK_LISTINGS.find((l) => l.listingPda === pda);
}

export function getMockListingViewByPda(pda: string): ListingView | undefined {
  const l = getMockListingByPda(pda);
  return l ? toListingView(l) : undefined;
}

/** OPEN bids on a listing, sorted highest price first (taker's perspective). */
export function getMockOpenBidsForListing(listingPda: string): Bid[] {
  return MOCK_BIDS.filter(
    (b) => b.listingPda === listingPda && b.status === "OPEN",
  ).sort(
    (a, b) =>
      Number(b.pricePerTokenMicroUsdc) - Number(a.pricePerTokenMicroUsdc),
  );
}
