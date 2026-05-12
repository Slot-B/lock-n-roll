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

// ─── Listings (18: 12 active across all tokens + 3 settled + 2 cancelled + 1 expired) ───

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
  // 7. ORCA — me maker, LISTED, asking + 2 bids (dashboard parity)
  {
    listingPda: "L7ORCAtdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
    makerWallet: MOCK_WALLETS.me,
    streamflowMetadata: "S7ORCAtdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",
    tokenMint: TOKENS.ORCA.mint,
    tokenDecimals: TOKENS.ORCA.decimals,
    vestingAmountRaw: tokenAmount(4_500, TOKENS.ORCA.decimals),
    unlockAt: days(75),
    askingPriceMicroUsdc: microUsdc(1.8), // -23.1% vs 2.34
    expiresAt: days(18),
    status: "LISTED",
    bidCount: 2,
    bestBidPriceMicroUsdc: microUsdc(1.68), // -28.2%
    createdAt: days(-4),
  },
  // 8. RAY — LISTED, asking only, no bids
  {
    listingPda: "L8RAYzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    makerWallet: MOCK_WALLETS.alice,
    streamflowMetadata: "S8RAYzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    tokenMint: TOKENS.RAY.mint,
    tokenDecimals: TOKENS.RAY.decimals,
    vestingAmountRaw: tokenAmount(12_000, TOKENS.RAY.decimals),
    unlockAt: days(45),
    askingPriceMicroUsdc: microUsdc(1.4), // -27% vs 1.92
    expiresAt: days(7),
    status: "LISTED",
    bidCount: 0,
    createdAt: days(0), // freshly listed today
  },
  // 9. JUP — me maker, LISTED, asking + 1 bid
  {
    listingPda: "L9JUPme2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP9vQ7tM",
    makerWallet: MOCK_WALLETS.me,
    streamflowMetadata: "S9JUPme2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP9vQ7tM",
    tokenMint: TOKENS.JUP.mint,
    tokenDecimals: TOKENS.JUP.decimals,
    vestingAmountRaw: tokenAmount(8_000, TOKENS.JUP.decimals),
    unlockAt: days(200),
    askingPriceMicroUsdc: microUsdc(0.75), // -18.5%
    expiresAt: days(25),
    status: "LISTED",
    bidCount: 1,
    bestBidPriceMicroUsdc: microUsdc(0.7), // -23.9%
    createdAt: days(-6),
  },
  // 10. BONK — LISTED, bid-only with 4 competing bids
  {
    listingPda: "L10BONKcarol2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP",
    makerWallet: MOCK_WALLETS.carol,
    streamflowMetadata: "S10BONKcarol2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP",
    tokenMint: TOKENS.BONK.mint,
    tokenDecimals: TOKENS.BONK.decimals,
    vestingAmountRaw: tokenAmount(8_500_000, TOKENS.BONK.decimals),
    unlockAt: days(110),
    askingPriceMicroUsdc: undefined,
    expiresAt: days(28),
    status: "LISTED",
    bidCount: 4,
    bestBidPriceMicroUsdc: microUsdc(0.0000275), // -11.3%
    createdAt: days(-2),
  },
  // 11. PYTH — LISTED, asking + 2 bids
  {
    listingPda: "L11PYTHbob2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kPyT",
    makerWallet: MOCK_WALLETS.bob,
    streamflowMetadata: "S11PYTHbob2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kPyT",
    tokenMint: TOKENS.PYTH.mint,
    tokenDecimals: TOKENS.PYTH.decimals,
    vestingAmountRaw: tokenAmount(35_000, TOKENS.PYTH.decimals),
    unlockAt: days(95),
    askingPriceMicroUsdc: microUsdc(0.13), // -27.8%
    expiresAt: days(15),
    status: "LISTED",
    bidCount: 2,
    bestBidPriceMicroUsdc: microUsdc(0.122), // -32.2%
    createdAt: days(-3),
  },
  // 12. DRIFT — LISTED, asking, no bids (new opportunity)
  {
    listingPda: "L12DRIFTdave2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kDf",
    makerWallet: MOCK_WALLETS.dave,
    streamflowMetadata: "S12DRIFTdave2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kDf",
    tokenMint: TOKENS.DRIFT.mint,
    tokenDecimals: TOKENS.DRIFT.decimals,
    vestingAmountRaw: tokenAmount(22_000, TOKENS.DRIFT.decimals),
    unlockAt: days(135),
    askingPriceMicroUsdc: microUsdc(0.62), // -27.1%
    expiresAt: days(35),
    status: "LISTED",
    bidCount: 0,
    createdAt: days(-1),
  },
  // 13. JTO — LISTED, bid-only, 2 bids
  {
    listingPda: "L13JTObob2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP9JT",
    makerWallet: MOCK_WALLETS.bob,
    streamflowMetadata: "S13JTObob2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kP9JT",
    tokenMint: TOKENS.JTO.mint,
    tokenDecimals: TOKENS.JTO.decimals,
    vestingAmountRaw: tokenAmount(18_000, TOKENS.JTO.decimals),
    unlockAt: days(220),
    askingPriceMicroUsdc: undefined,
    expiresAt: days(40),
    status: "LISTED",
    bidCount: 2,
    bestBidPriceMicroUsdc: microUsdc(2.6), // -24%
    createdAt: days(-7),
  },
  // 14. WEN — LISTED, asking, 1 bid
  {
    listingPda: "L14WENalice2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kPwn",
    makerWallet: MOCK_WALLETS.alice,
    streamflowMetadata: "S14WENalice2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kPwn",
    tokenMint: TOKENS.WEN.mint,
    tokenDecimals: TOKENS.WEN.decimals,
    vestingAmountRaw: tokenAmount(2_400_000, TOKENS.WEN.decimals),
    unlockAt: days(280),
    askingPriceMicroUsdc: microUsdc(0.0001), // -16.7%
    expiresAt: days(50),
    status: "LISTED",
    bidCount: 1,
    bestBidPriceMicroUsdc: microUsdc(0.000088), // -26.7%
    createdAt: days(-9),
  },
  // 15. RAY — me maker, SETTLED (dashboard history)
  {
    listingPda: "L15RAYmeSet2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kRyM",
    makerWallet: MOCK_WALLETS.me,
    streamflowMetadata: "S15RAYmeSet2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kRyM",
    tokenMint: TOKENS.RAY.mint,
    tokenDecimals: TOKENS.RAY.decimals,
    vestingAmountRaw: tokenAmount(6_000, TOKENS.RAY.decimals),
    unlockAt: days(28),
    askingPriceMicroUsdc: microUsdc(1.5),
    expiresAt: days(-2), // expired/past — but settled before
    status: "SETTLED",
    bidCount: 0,
    createdAt: days(-12),
  },
  // 16. BONK — SETTLED via accept-bid (history)
  {
    listingPda: "L16BONKalSet2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kBs",
    makerWallet: MOCK_WALLETS.alice,
    streamflowMetadata: "S16BONKalSet2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kBs",
    tokenMint: TOKENS.BONK.mint,
    tokenDecimals: TOKENS.BONK.decimals,
    vestingAmountRaw: tokenAmount(3_500_000, TOKENS.BONK.decimals),
    unlockAt: days(40),
    askingPriceMicroUsdc: undefined,
    expiresAt: days(-1),
    status: "SETTLED",
    bidCount: 0,
    createdAt: days(-14),
  },
  // 17. JUP — me maker, EXPIRED with open bid → bidder refund available
  {
    listingPda: "L17JUPmeExp2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kJpE",
    makerWallet: MOCK_WALLETS.me,
    streamflowMetadata: "S17JUPmeExp2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kJpE",
    tokenMint: TOKENS.JUP.mint,
    tokenDecimals: TOKENS.JUP.decimals,
    vestingAmountRaw: tokenAmount(5_000, TOKENS.JUP.decimals),
    unlockAt: days(50),
    askingPriceMicroUsdc: microUsdc(0.85),
    expiresAt: days(-3),
    status: "EXPIRED",
    bidCount: 1,
    bestBidPriceMicroUsdc: undefined,
    createdAt: days(-30),
  },
  // 18. ORCA — CANCELLED by carol, me has open bid → refund available
  {
    listingPda: "L18ORCAcaCan2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kOrC",
    makerWallet: MOCK_WALLETS.carol,
    streamflowMetadata: "S18ORCAcaCan2Lz7pQ5tNb4xRsW8Yj1cF2dG6hM3kOrC",
    tokenMint: TOKENS.ORCA.mint,
    tokenDecimals: TOKENS.ORCA.decimals,
    vestingAmountRaw: tokenAmount(2_000, TOKENS.ORCA.decimals),
    unlockAt: days(70),
    askingPriceMicroUsdc: undefined,
    expiresAt: days(15),
    status: "CANCELLED",
    bidCount: 1,
    bestBidPriceMicroUsdc: undefined,
    createdAt: days(-6),
  },
];

// ─── Bids (19 total: 5 original + 14 new) ──────────────────────────────

export const MOCK_BIDS: Bid[] = [
  // Bids on listing 1 (JTO/alice)
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
  // Bid on listing 3 (WEN/carol, bid-only)
  {
    bidPda: "B4WEN_CAROL_Dave",
    listingPda: MOCK_LISTINGS[2].listingPda,
    bidderWallet: MOCK_WALLETS.dave,
    pricePerTokenMicroUsdc: microUsdc(0.000066),
    totalUsdcRaw: microUsdc(0.000066 * 500_000),
    status: "OPEN",
    createdAt: days(-2),
  },
  // Bid on listing 6 (DRIFT/bob cancelled) — refund-available
  {
    bidPda: "B5DRIFT_BOB_Me",
    listingPda: MOCK_LISTINGS[5].listingPda,
    bidderWallet: MOCK_WALLETS.me,
    pricePerTokenMicroUsdc: microUsdc(0.62),
    totalUsdcRaw: microUsdc(0.62 * 15_000),
    status: "OPEN",
    createdAt: days(-7),
  },
  // Bids on listing 7 (ORCA/me)
  {
    bidPda: "B6ORCA_ME_Alice",
    listingPda: MOCK_LISTINGS[6].listingPda,
    bidderWallet: MOCK_WALLETS.alice,
    pricePerTokenMicroUsdc: microUsdc(1.68),
    totalUsdcRaw: microUsdc(1.68 * 4_500),
    status: "OPEN",
    createdAt: days(-3),
  },
  {
    bidPda: "B7ORCA_ME_Bob",
    listingPda: MOCK_LISTINGS[6].listingPda,
    bidderWallet: MOCK_WALLETS.bob,
    pricePerTokenMicroUsdc: microUsdc(1.6),
    totalUsdcRaw: microUsdc(1.6 * 4_500),
    status: "OPEN",
    createdAt: days(-2),
  },
  // Bid on listing 9 (JUP/me)
  {
    bidPda: "B8JUP_ME_Carol",
    listingPda: MOCK_LISTINGS[8].listingPda,
    bidderWallet: MOCK_WALLETS.carol,
    pricePerTokenMicroUsdc: microUsdc(0.7),
    totalUsdcRaw: microUsdc(0.7 * 8_000),
    status: "OPEN",
    createdAt: days(-5),
  },
  // Bids on listing 10 (BONK/carol, bid-only, hot)
  {
    bidPda: "B9BONK_CAROL_Alice",
    listingPda: MOCK_LISTINGS[9].listingPda,
    bidderWallet: MOCK_WALLETS.alice,
    pricePerTokenMicroUsdc: microUsdc(0.0000275),
    totalUsdcRaw: microUsdc(0.0000275 * 8_500_000),
    status: "OPEN",
    createdAt: days(-1),
  },
  {
    bidPda: "B10BONK_CAROL_Bob",
    listingPda: MOCK_LISTINGS[9].listingPda,
    bidderWallet: MOCK_WALLETS.bob,
    pricePerTokenMicroUsdc: microUsdc(0.000026),
    totalUsdcRaw: microUsdc(0.000026 * 8_500_000),
    status: "OPEN",
    createdAt: days(-1),
  },
  {
    bidPda: "B11BONK_CAROL_Dave",
    listingPda: MOCK_LISTINGS[9].listingPda,
    bidderWallet: MOCK_WALLETS.dave,
    pricePerTokenMicroUsdc: microUsdc(0.0000248),
    totalUsdcRaw: microUsdc(0.0000248 * 8_500_000),
    status: "OPEN",
    createdAt: days(-2),
  },
  {
    bidPda: "B12BONK_CAROL_Me",
    listingPda: MOCK_LISTINGS[9].listingPda,
    bidderWallet: MOCK_WALLETS.me,
    pricePerTokenMicroUsdc: microUsdc(0.0000232),
    totalUsdcRaw: microUsdc(0.0000232 * 8_500_000),
    status: "OPEN",
    createdAt: days(0),
  },
  // Bids on listing 11 (PYTH/bob)
  {
    bidPda: "B13PYTH_BOB_Carol",
    listingPda: MOCK_LISTINGS[10].listingPda,
    bidderWallet: MOCK_WALLETS.carol,
    pricePerTokenMicroUsdc: microUsdc(0.122),
    totalUsdcRaw: microUsdc(0.122 * 35_000),
    status: "OPEN",
    createdAt: days(-2),
  },
  {
    bidPda: "B14PYTH_BOB_Me",
    listingPda: MOCK_LISTINGS[10].listingPda,
    bidderWallet: MOCK_WALLETS.me,
    pricePerTokenMicroUsdc: microUsdc(0.115),
    totalUsdcRaw: microUsdc(0.115 * 35_000),
    status: "OPEN",
    createdAt: days(-1),
  },
  // Bids on listing 13 (JTO/bob, bid-only)
  {
    bidPda: "B15JTO_BOB_Alice",
    listingPda: MOCK_LISTINGS[12].listingPda,
    bidderWallet: MOCK_WALLETS.alice,
    pricePerTokenMicroUsdc: microUsdc(2.6),
    totalUsdcRaw: microUsdc(2.6 * 18_000),
    status: "OPEN",
    createdAt: days(-5),
  },
  {
    bidPda: "B16JTO_BOB_Me",
    listingPda: MOCK_LISTINGS[12].listingPda,
    bidderWallet: MOCK_WALLETS.me,
    pricePerTokenMicroUsdc: microUsdc(2.45),
    totalUsdcRaw: microUsdc(2.45 * 18_000),
    status: "OPEN",
    createdAt: days(-4),
  },
  // Bid on listing 14 (WEN/alice)
  {
    bidPda: "B17WEN_ALICE_Bob",
    listingPda: MOCK_LISTINGS[13].listingPda,
    bidderWallet: MOCK_WALLETS.bob,
    pricePerTokenMicroUsdc: microUsdc(0.000088),
    totalUsdcRaw: microUsdc(0.000088 * 2_400_000),
    status: "OPEN",
    createdAt: days(-8),
  },
  // Bid on listing 17 (JUP/me, EXPIRED) — refund-available scenario
  {
    bidPda: "B18JUP_ME_Alice_Refund",
    listingPda: MOCK_LISTINGS[16].listingPda,
    bidderWallet: MOCK_WALLETS.alice,
    pricePerTokenMicroUsdc: microUsdc(0.78),
    totalUsdcRaw: microUsdc(0.78 * 5_000),
    status: "OPEN",
    createdAt: days(-28),
  },
  // Bid on listing 18 (ORCA/carol, CANCELLED) — refund-available for me
  {
    bidPda: "B19ORCA_CAROL_Me_Refund",
    listingPda: MOCK_LISTINGS[17].listingPda,
    bidderWallet: MOCK_WALLETS.me,
    pricePerTokenMicroUsdc: microUsdc(1.75),
    totalUsdcRaw: microUsdc(1.75 * 2_000),
    status: "OPEN",
    createdAt: days(-5),
  },
];

// ─── Trades (10 settled) ───────────────────────────────────────────────

export const MOCK_TRADES: Trade[] = [
  // 1. PYTH settled via bid (listing 5)
  {
    tradeId: 1,
    txSignature: "5eW2Pz3RnG4Lj1KqVx8Xc6dAY9Jt2Mb3PqFhRsZk",
    listingPda: MOCK_LISTINGS[4].listingPda,
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
  // 2. RAY bought by me via asking
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
  // 3. ORCA settled via bid (alice takes carol's bid-only listing)
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
    totalUsdcRaw: microUsdc(1.65 * 2.34 / 1.65 * 2_500),
    marketPriceMicroUsdc: microUsdc(2.34),
    discountRate: discount(1.65, 2.34),
    mode: "bid",
    settledAt: days(-7),
  },
  // 4. RAY (listing 15, me maker) — SETTLED on dashboard
  {
    tradeId: 4,
    txSignature: "7Hg4Kf8Lp3Rd2Mn5VwBd8RcGk3PqFhRsZk5eW2Pz3RAY",
    listingPda: MOCK_LISTINGS[14].listingPda,
    acceptedBidPda: undefined,
    streamflowMetadata: MOCK_LISTINGS[14].streamflowMetadata,
    makerWallet: MOCK_LISTINGS[14].makerWallet,
    takerWallet: MOCK_WALLETS.dave,
    tokenMint: MOCK_LISTINGS[14].tokenMint,
    vestingAmountRaw: MOCK_LISTINGS[14].vestingAmountRaw,
    pricePerTokenMicroUsdc: microUsdc(1.5),
    totalUsdcRaw: microUsdc(1.5 * 6_000),
    marketPriceMicroUsdc: microUsdc(1.92),
    discountRate: discount(1.5, 1.92),
    mode: "asking",
    settledAt: days(-11),
  },
  // 5. BONK (listing 16, alice maker) — SETTLED via bid
  {
    tradeId: 5,
    txSignature: "2Qw7Mj1Lz4XvCd5YfHt6Nb3PqFhRsZk5eW2Pz3RBONKv",
    listingPda: MOCK_LISTINGS[15].listingPda,
    acceptedBidPda: "BSETTLED_BONK_Me",
    streamflowMetadata: MOCK_LISTINGS[15].streamflowMetadata,
    makerWallet: MOCK_LISTINGS[15].makerWallet,
    takerWallet: MOCK_WALLETS.me,
    tokenMint: MOCK_LISTINGS[15].tokenMint,
    vestingAmountRaw: MOCK_LISTINGS[15].vestingAmountRaw,
    pricePerTokenMicroUsdc: microUsdc(0.0000242),
    totalUsdcRaw: microUsdc(0.0000242 * 3_500_000),
    marketPriceMicroUsdc: microUsdc(0.000031),
    discountRate: discount(0.0000242, 0.000031),
    mode: "bid",
    settledAt: days(-13),
  },
  // 6. JUP buy-now (me as taker) — older trade
  {
    tradeId: 6,
    txSignature: "8Lp3Rd2Mn5VwBd8RcGk3PqFhRsZk5eW2Pz3RJUPiterTx",
    listingPda: "LBOLD_PRIOR_TRADE_JUP",
    streamflowMetadata: "SBOLD_PRIOR_TRADE_JUP",
    makerWallet: MOCK_WALLETS.carol,
    takerWallet: MOCK_WALLETS.me,
    tokenMint: TOKENS.JUP.mint,
    vestingAmountRaw: tokenAmount(12_000, TOKENS.JUP.decimals),
    pricePerTokenMicroUsdc: microUsdc(0.78),
    totalUsdcRaw: microUsdc(0.78 * 12_000),
    marketPriceMicroUsdc: microUsdc(0.92),
    discountRate: discount(0.78, 0.92),
    mode: "asking",
    settledAt: days(-16),
  },
  // 7. WEN settled via bid
  {
    tradeId: 7,
    txSignature: "WEN5eW2Pz3RnG4Lj1KqVx8Xc6dAY9Jt2Mb3PqFhRsZk",
    listingPda: "LBOLD_PRIOR_TRADE_WEN",
    streamflowMetadata: "SBOLD_PRIOR_TRADE_WEN",
    makerWallet: MOCK_WALLETS.bob,
    takerWallet: MOCK_WALLETS.alice,
    tokenMint: TOKENS.WEN.mint,
    vestingAmountRaw: tokenAmount(800_000, TOKENS.WEN.decimals),
    pricePerTokenMicroUsdc: microUsdc(0.000082),
    totalUsdcRaw: microUsdc(0.000082 * 800_000),
    marketPriceMicroUsdc: microUsdc(0.00012),
    discountRate: discount(0.000082, 0.00012),
    mode: "bid",
    settledAt: days(-18),
  },
  // 8. DRIFT buy-now
  {
    tradeId: 8,
    txSignature: "DRIFT9Tz1Hx7Yj4Lq2Mn5VwBd8RcGk3PqFhRsZk5eW2",
    listingPda: "LBOLD_PRIOR_TRADE_DRIFT",
    streamflowMetadata: "SBOLD_PRIOR_TRADE_DRIFT",
    makerWallet: MOCK_WALLETS.alice,
    takerWallet: MOCK_WALLETS.bob,
    tokenMint: TOKENS.DRIFT.mint,
    vestingAmountRaw: tokenAmount(10_000, TOKENS.DRIFT.decimals),
    pricePerTokenMicroUsdc: microUsdc(0.7),
    totalUsdcRaw: microUsdc(0.7 * 10_000),
    marketPriceMicroUsdc: microUsdc(0.85),
    discountRate: discount(0.7, 0.85),
    mode: "asking",
    settledAt: days(-21),
  },
  // 9. JTO settled via bid (large vesting amount)
  {
    tradeId: 9,
    txSignature: "JTOBigSettle3Px9Bk2Qw7Mj1Lz4XvCd5YfHt6Nb3Pq",
    listingPda: "LBOLD_PRIOR_TRADE_JTO_BIG",
    streamflowMetadata: "SBOLD_PRIOR_TRADE_JTO_BIG",
    makerWallet: MOCK_WALLETS.dave,
    takerWallet: MOCK_WALLETS.carol,
    tokenMint: TOKENS.JTO.mint,
    vestingAmountRaw: tokenAmount(75_000, TOKENS.JTO.decimals),
    pricePerTokenMicroUsdc: microUsdc(2.15),
    totalUsdcRaw: microUsdc(2.15 * 75_000),
    marketPriceMicroUsdc: microUsdc(3.42),
    discountRate: discount(2.15, 3.42),
    mode: "bid",
    settledAt: days(-25),
  },
  // 10. PYTH older buy-now
  {
    tradeId: 10,
    txSignature: "PYTHaskOlder8Lp3Rd2Mn5VwBd8RcGk3PqFhRsZk5eW2",
    listingPda: "LBOLD_PRIOR_TRADE_PYTH_OLD",
    streamflowMetadata: "SBOLD_PRIOR_TRADE_PYTH_OLD",
    makerWallet: MOCK_WALLETS.bob,
    takerWallet: MOCK_WALLETS.dave,
    tokenMint: TOKENS.PYTH.mint,
    vestingAmountRaw: tokenAmount(45_000, TOKENS.PYTH.decimals),
    pricePerTokenMicroUsdc: microUsdc(0.14),
    totalUsdcRaw: microUsdc(0.14 * 45_000),
    marketPriceMicroUsdc: microUsdc(0.18),
    discountRate: discount(0.14, 0.18),
    mode: "asking",
    settledAt: days(-30),
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
