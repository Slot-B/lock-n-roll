import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db/client.js";
import { reconcile } from "../src/reconciliation/checks.js";
import { MockStreamflowReader, type StreamflowSnapshot } from "../src/reconciliation/streamflowReader.js";

const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
const expect = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
};

const M = "TestMakerR1111111111111111111111111111111";
const TOK = "TestTokenR1111111111111111111111111111111";

const SM_HEALTHY = "TestStreamRH111111111111111111111111111111";
const SM_RECIPIENT_DRIFT = "TestStreamRD111111111111111111111111111111";
const SM_VERSION_DRIFT = "TestStreamRV111111111111111111111111111111";
const SM_AMOUNT_DRIFT = "TestStreamRA111111111111111111111111111111";
const SM_MISSING = "TestStreamRM111111111111111111111111111111";

const L_HEALTHY = "TestListingRH11111111111111111111111111111";
const L_RECIPIENT_DRIFT = "TestListingRD11111111111111111111111111111";
const L_VERSION_DRIFT = "TestListingRV11111111111111111111111111111";
const L_AMOUNT_DRIFT = "TestListingRA11111111111111111111111111111";
const L_MISSING = "TestListingRM11111111111111111111111111111";

const futureDate = new Date(Date.now() + 7 * 86400_000);
const unlockDate = new Date(Date.now() + 30 * 86400_000);

async function clean() {
  await db.delete(schema.bids);
  await db.delete(schema.tradeHistory);
  await db.delete(schema.processedEvents);
  await db.delete(schema.reconciliationIssues);
  await db.delete(schema.orders);
  await db.delete(schema.users);
}

async function seedListings() {
  await db.insert(schema.users).values([{ walletAddress: M }]);
  await db.insert(schema.orders).values(
    [L_HEALTHY, L_RECIPIENT_DRIFT, L_VERSION_DRIFT, L_AMOUNT_DRIFT, L_MISSING].map((l, i) => ({
      listingPda: l,
      makerWallet: M,
      streamflowMetadata: [SM_HEALTHY, SM_RECIPIENT_DRIFT, SM_VERSION_DRIFT, SM_AMOUNT_DRIFT, SM_MISSING][i]!,
      tokenMint: TOK,
      tokenDecimals: 6,
      vestingAmountRaw: "1000000000",
      unlockAt: unlockDate,
      askingPriceMicroUsdc: "10000",
      expiresAt: futureDate,
      status: "LISTED" as const,
      bidCount: 0,
    })),
  );
}

async function main() {
  await clean();
  await seedListings();

  const fixtures = new Map<string, StreamflowSnapshot>([
    [SM_HEALTHY, { kind: "ok", ownerOk: true, version: 4, recipient: L_HEALTHY, mint: TOK, vestingAmountRaw: 1000000000n, closed: false }],
    [SM_RECIPIENT_DRIFT, { kind: "ok", ownerOk: true, version: 4, recipient: "SomeoneElse11111111111111111111111111111", mint: TOK, vestingAmountRaw: 1000000000n, closed: false }],
    [SM_VERSION_DRIFT, { kind: "ok", ownerOk: true, version: 5, recipient: L_VERSION_DRIFT, mint: TOK, vestingAmountRaw: 1000000000n, closed: false }],
    [SM_AMOUNT_DRIFT, { kind: "ok", ownerOk: true, version: 4, recipient: L_AMOUNT_DRIFT, mint: TOK, vestingAmountRaw: 500000000n, closed: false }],
    // SM_MISSING intentionally absent → reader returns "missing"
  ]);

  const reader = new MockStreamflowReader(fixtures);
  const report = await reconcile(reader);

  expect("scanned 5 LISTED orders", report.scanned === 5, `scanned=${report.scanned}`);
  expect("4 issues reported", report.total_issues === 4, `total=${report.total_issues}`);
  expect("1 RECIPIENT_MISMATCH", report.issuesByType.RECIPIENT_MISMATCH === 1);
  expect("1 VERSION_MISMATCH", report.issuesByType.VERSION_MISMATCH === 1);
  expect("1 VESTING_AMOUNT_DRIFT (50% drop)", report.issuesByType.VESTING_AMOUNT_DRIFT === 1);
  expect("1 METADATA_MISSING_OR_BAD_OWNER", report.issuesByType.METADATA_MISSING_OR_BAD_OWNER === 1);

  const issues = await db.select().from(schema.reconciliationIssues);
  expect("4 rows in reconciliation_issues table", issues.length === 4);

  // Critical: orders MUST NOT be auto-mutated
  const ordersAfter = await db.select().from(schema.orders);
  expect("all orders still LISTED (no auto-mutation)",
    ordersAfter.every((o) => o.status === "LISTED"),
    `statuses=${ordersAfter.map((o) => o.status).join(",")}`);

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n=== ${checks.length - failed.length}/${checks.length} passed ===`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
