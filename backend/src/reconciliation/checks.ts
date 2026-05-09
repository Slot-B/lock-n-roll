import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { config } from "../config/env.js";
import type { StreamflowReader, StreamflowSnapshot } from "./streamflowReader.js";

export type IssueType =
  | "METADATA_MISSING_OR_BAD_OWNER"
  | "RECIPIENT_MISMATCH"
  | "VERSION_MISMATCH"
  | "MINT_MISMATCH"
  | "VESTING_AMOUNT_DRIFT"
  | "CLOSED_UNEXPECTEDLY";

type OrderRow = typeof schema.orders.$inferSelect;

export interface ReconcileReport {
  scanned: number;
  issuesByType: Record<IssueType, number>;
  total_issues: number;
  duration_ms: number;
}

const newIssueCounter = (): Record<IssueType, number> => ({
  METADATA_MISSING_OR_BAD_OWNER: 0,
  RECIPIENT_MISMATCH: 0,
  VERSION_MISMATCH: 0,
  MINT_MISMATCH: 0,
  VESTING_AMOUNT_DRIFT: 0,
  CLOSED_UNEXPECTEDLY: 0,
});

export function checkOrder(order: OrderRow, snap: StreamflowSnapshot, expectedVersion: number) {
  const issues: Array<{ type: IssueType; details: Record<string, unknown> }> = [];

  if (snap.kind === "missing") {
    issues.push({ type: "METADATA_MISSING_OR_BAD_OWNER", details: { reason: snap.reason } });
    return issues;
  }

  if (!snap.ownerOk) {
    issues.push({ type: "METADATA_MISSING_OR_BAD_OWNER", details: { reason: "owner != STREAMFLOW_PROGRAM_ID" } });
  }

  if (snap.version !== expectedVersion) {
    issues.push({
      type: "VERSION_MISMATCH",
      details: { expected: expectedVersion, actual: snap.version },
    });
  }

  if (snap.recipient !== order.listingPda) {
    issues.push({
      type: "RECIPIENT_MISMATCH",
      details: { expected: order.listingPda, actual: snap.recipient },
    });
  }

  if (snap.mint !== order.tokenMint) {
    issues.push({
      type: "MINT_MISMATCH",
      details: { expected: order.tokenMint, actual: snap.mint },
    });
  }

  const dbAmount = BigInt(order.vestingAmountRaw);
  if (dbAmount > 0n) {
    const diff = snap.vestingAmountRaw > dbAmount ? snap.vestingAmountRaw - dbAmount : dbAmount - snap.vestingAmountRaw;
    const driftBps = Number((diff * 10_000n) / dbAmount);
    if (driftBps > 500) {
      issues.push({
        type: "VESTING_AMOUNT_DRIFT",
        details: { db: order.vestingAmountRaw, live: snap.vestingAmountRaw.toString(), drift_bps: driftBps },
      });
    }
  }

  if (snap.closed) {
    issues.push({ type: "CLOSED_UNEXPECTEDLY", details: {} });
  }

  return issues;
}

export async function reconcile(reader: StreamflowReader): Promise<ReconcileReport> {
  const t0 = Date.now();
  const counts = newIssueCounter();
  let totalIssues = 0;

  const listed = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.status, "LISTED"));

  for (const order of listed) {
    const snap = await reader.read(order.streamflowMetadata);
    const issues = checkOrder(order, snap, config.networkConfig.EXPECTED_STREAMFLOW_VERSION);

    for (const issue of issues) {
      counts[issue.type] += 1;
      totalIssues += 1;
      await db.insert(schema.reconciliationIssues).values({
        listingPda: order.listingPda,
        issueType: issue.type,
        details: issue.details,
      });
    }
  }

  return {
    scanned: listed.length,
    issuesByType: counts,
    total_issues: totalIssues,
    duration_ms: Date.now() - t0,
  };
}
