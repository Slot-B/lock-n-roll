"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowRight, Plus, Wallet } from "lucide-react";

import { DiscountBadge } from "@/components/domain/discount-badge";
import { ListingCard } from "@/components/domain/listing-card";
import { StatusBadge } from "@/components/domain/status-badge";
import { TokenIcon } from "@/components/domain/token-icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatPricePerToken,
  formatTokenAmount,
  formatUsdc,
  shortAddress,
} from "@/lib/format";
import {
  MOCK_MY_BIDS,
  MOCK_MY_LISTINGS,
  MOCK_RECENT_TRADES,
  getMockListingByPda,
  toListingView,
} from "@/lib/mock";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  // Mount-gate the wallet context: SSR can't read publicKey safely.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const wallet = useWallet();
  const publicKey = mounted ? wallet.publicKey : null;
  const walletAddr = publicKey?.toBase58();

  const myListings = MOCK_MY_LISTINGS;
  const myBids = MOCK_MY_BIDS;
  const trades = MOCK_RECENT_TRADES;

  const activeCount = myListings.filter((l) => l.status === "LISTED").length;
  const openBidCount = myBids.filter((b) => b.status === "OPEN").length;
  const refundableCount = myBids.filter((b) => b.refundAvailable).length;

  return (
    <main className="min-h-[calc(100svh-80px)] bg-black">
      <div className="mx-auto max-w-7xl px-6 py-16 md:py-20">
        {/* ─── Header ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              / Dashboard
            </span>
            <h1 className="mt-3 font-display text-[clamp(40px,7vw,72px)] font-semibold uppercase leading-[0.95] tracking-normal text-white">
              Your trading desk.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-foreground/65">
              Listings you opened, bids you placed, and settled trades — all
              in one place.
            </p>
          </div>
          <Link
            href="/create"
            className="group inline-flex h-12 items-center justify-center gap-2 self-start rounded-[10px] bg-white px-6 text-sm font-medium text-black transition-all hover:bg-brand-ice active:translate-y-px"
          >
            <Plus className="h-4 w-4" />
            New listing
          </Link>
        </div>

        {!publicKey && <ConnectPrompt />}

        {/* ─── Stats ─────────────────────────────────────────────── */}
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active listings" value={activeCount} />
          <StatCard label="Open bids" value={openBidCount} />
          <StatCard label="Refundable" value={refundableCount} accent />
          <StatCard label="Settled trades" value={trades.length} />
        </div>

        {/* ─── Wallet identity ──────────────────────────────────── */}
        {walletAddr && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-[6px] border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-foreground/80">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-violet" />
            {shortAddress(walletAddr, 6, 6)}
          </div>
        )}

        {/* ─── Tabs ─────────────────────────────────────────────── */}
        <Tabs defaultValue="listings" className="mt-10">
          <TabsList className="bg-white/[0.04]">
            <TabsTrigger value="listings">
              My Listings <span className="ml-1.5 text-foreground/45">({myListings.length})</span>
            </TabsTrigger>
            <TabsTrigger value="bids">
              My Bids <span className="ml-1.5 text-foreground/45">({myBids.length})</span>
            </TabsTrigger>
            <TabsTrigger value="history">
              Trade History <span className="ml-1.5 text-foreground/45">({trades.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* My Listings */}
          <TabsContent value="listings" className="mt-6">
            {myListings.length === 0 ? (
              <Empty
                title="No listings yet"
                hint="Open your first locked stream — it takes one tx."
                ctaLabel="Create listing"
                ctaHref="/create"
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {myListings.map((listing) => (
                  <ListingCard key={listing.listingPda} listing={listing} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* My Bids */}
          <TabsContent value="bids" className="mt-6">
            {myBids.length === 0 ? (
              <Empty
                title="No bids placed"
                hint="Browse the market and offer for any locked stream."
                ctaLabel="Open market"
                ctaHref="/market"
              />
            ) : (
              <div className="overflow-hidden rounded-[8px] border border-white/15 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead>Listing</TableHead>
                      <TableHead className="text-right">Bid price</TableHead>
                      <TableHead className="text-right">Total USDC</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myBids.map((bid) => {
                      const parent = getMockListingByPda(bid.listingPda);
                      const view = parent ? toListingView(parent) : null;
                      return (
                        <TableRow key={bid.bidPda} className="border-white/5">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {view && <TokenIcon token={view.token} size={28} />}
                              <div className="min-w-0">
                                <div className="font-display text-sm uppercase tracking-tight text-foreground">
                                  {view?.token.symbol ?? "—"}
                                </div>
                                <div className="font-mono text-[11px] text-foreground/45">
                                  {shortAddress(bid.listingPda, 4, 4)}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatPricePerToken(bid.pricePerTokenMicroUsdc)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatUsdc(bid.totalUsdcRaw)}
                          </TableCell>
                          <TableCell>
                            <BidStatusPill
                              status={bid.status}
                              refundAvailable={bid.refundAvailable}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-foreground/65">
                            {formatRelative(bid.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            {bid.refundAvailable ? (
                              <button
                                type="button"
                                className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-brand-violet/40 bg-brand-violet/15 px-3 font-mono text-[11px] uppercase tracking-wider text-brand-violet hover:bg-brand-violet/25"
                                onClick={() =>
                                  // eslint-disable-next-line no-console
                                  console.log("[Withdraw bid]", bid.bidPda)
                                }
                              >
                                Withdraw
                              </button>
                            ) : (
                              <Link
                                href={`/market/${bid.listingPda}`}
                                className="inline-flex h-8 items-center gap-1 rounded-[6px] border border-white/15 bg-white/[0.04] px-3 font-mono text-[11px] uppercase tracking-wider text-foreground/75 hover:border-white/30"
                              >
                                View
                                <ArrowRight className="h-3 w-3" />
                              </Link>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Trade History */}
          <TabsContent value="history" className="mt-6">
            {trades.length === 0 ? (
              <Empty
                title="No settled trades"
                hint="Your completed deals will land here."
              />
            ) : (
              <div className="overflow-hidden rounded-[8px] border border-white/15 bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead>Listing</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">vs Market</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Settled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((t) => {
                      const parent = getMockListingByPda(t.listingPda);
                      const view = parent ? toListingView(parent) : null;
                      const role =
                        walletAddr && t.makerWallet === walletAddr
                          ? "Maker"
                          : walletAddr && t.takerWallet === walletAddr
                            ? "Taker"
                            : "—";
                      return (
                        <TableRow key={t.tradeId} className="border-white/5">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {view && <TokenIcon token={view.token} size={28} />}
                              <div className="min-w-0">
                                <div className="font-display text-sm uppercase tracking-tight text-foreground">
                                  {view?.token.symbol ?? "—"}
                                </div>
                                <div className="font-mono text-[11px] text-foreground/45">
                                  {shortAddress(t.listingPda, 4, 4)}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex h-6 items-center rounded-[4px] px-2 font-mono text-[10px] uppercase tracking-wider",
                                role === "Maker"
                                  ? "bg-brand-violet/20 text-brand-violet"
                                  : role === "Taker"
                                    ? "bg-brand-ice/20 text-brand-ice"
                                    : "bg-white/[0.06] text-foreground/55",
                              )}
                            >
                              {role}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatPricePerToken(t.pricePerTokenMicroUsdc)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatUsdc(t.totalUsdcRaw)}
                          </TableCell>
                          <TableCell className="text-right">
                            {t.discountRate !== undefined ? (
                              <DiscountBadge rate={t.discountRate} />
                            ) : (
                              <span className="text-foreground/35">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-[11px] uppercase tracking-wider text-foreground/65">
                            {t.mode}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-foreground/65">
                            {formatRelative(t.settledAt)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

// ─── Local primitives ──────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[8px] border border-white/15 bg-card px-5 py-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/55">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 font-display text-3xl font-semibold tabular-nums",
          accent ? "text-brand-violet" : "text-white",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function BidStatusPill({
  status,
  refundAvailable,
}: {
  status: "OPEN" | "ACCEPTED" | "WITHDRAWN";
  refundAvailable: boolean;
}) {
  if (refundAvailable) {
    return (
      <span className="inline-flex h-6 items-center rounded-[4px] bg-brand-violet/20 px-2 font-mono text-[10px] uppercase tracking-wider text-brand-violet">
        Refundable
      </span>
    );
  }
  const tone =
    status === "ACCEPTED"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "WITHDRAWN"
        ? "bg-white/[0.06] text-foreground/55"
        : "bg-amber-500/15 text-amber-300";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-[4px] px-2 font-mono text-[10px] uppercase tracking-wider",
        tone,
      )}
    >
      {status.toLowerCase()}
    </span>
  );
}

function ConnectPrompt() {
  return (
    <div className="mt-10 flex items-start gap-3 rounded-[8px] border border-brand-violet/30 bg-brand-violet/10 px-5 py-4 text-sm text-foreground">
      <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-brand-violet" />
      <div>
        <span className="font-medium">Connect your wallet to see live data.</span>
        <span className="ml-1 text-foreground/65">
          Showing sample fixtures until then.
        </span>
      </div>
    </div>
  );
}

function Empty({
  title,
  hint,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  hint: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[8px] border border-dashed border-white/15 bg-white/[0.02] py-16 text-center">
      <div className="font-display text-xl font-semibold uppercase text-foreground">
        {title}
      </div>
      <p className="mt-2 max-w-md text-sm text-foreground/55">{hint}</p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-[6px] border border-white/15 bg-white/[0.04] px-5 text-sm font-medium text-foreground hover:border-white/30"
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

// Suppress unused-warning for formatTokenAmount which we may need later
// when listing view rows surface vesting amount detail.
void formatTokenAmount;

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

// Avoid unused import warning when StatusBadge isn't placed in a row above.
void StatusBadge;
