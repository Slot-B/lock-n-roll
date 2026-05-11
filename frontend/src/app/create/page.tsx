"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowLeft, ArrowRight, LockKeyhole, Wallet } from "lucide-react";

import ElectricBorder from "@/components/ElectricBorder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function CreatePage() {
  // Mount-gate the wallet context: the default context object on the
  // server side throws on property reads, so only resolve `publicKey`
  // once we are mounted on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const wallet = useWallet();
  const publicKey = mounted ? wallet.publicKey : null;
  const [streamPda, setStreamPda] = useState("");
  const [bidOnly, setBidOnly] = useState(false);
  const [askingPriceUsdc, setAskingPriceUsdc] = useState("");
  const [expiryHours, setExpiryHours] = useState<number>(48);
  const [submitting, setSubmitting] = useState(false);

  const isValidPda = streamPda.length >= 32 && streamPda.length <= 44;
  const askingValid = bidOnly || Number(askingPriceUsdc) > 0;
  const canSubmit = !!publicKey && isValidPda && askingValid && expiryHours > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    // TODO(M2): wire to listing program. For now just stash in console.
    // eslint-disable-next-line no-console
    console.log("[Create Listing] submit payload:", {
      maker: publicKey?.toBase58(),
      streamPda,
      bidOnly,
      askingPriceUsdc: bidOnly ? null : askingPriceUsdc,
      expiryHours,
    });
    setTimeout(() => setSubmitting(false), 600);
  };

  return (
    <main className="min-h-[calc(100svh-80px)] bg-black">
      <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <Link
          href="/market"
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground/60 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Market
        </Link>

        <div className="mt-8">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            / Create listing
          </span>
          <h1 className="mt-3 font-display text-[clamp(40px,7vw,72px)] font-semibold uppercase leading-[0.95] tracking-normal text-white">
            List your locked stream.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-foreground/70 md:text-lg">
            Pick a Streamflow vesting contract, set your asking price, and
            transfer the recipient authority to the listing PDA. The token
            never leaves the original stream.
          </p>
        </div>

        {!publicKey && <ConnectPrompt />}

        <form className="mt-12 flex flex-col gap-5" onSubmit={handleSubmit}>
          <Step number="01" title="Pick a stream">
            <Label htmlFor="stream-pda" className="text-foreground/80">
              Streamflow stream PDA
            </Label>
            <Input
              id="stream-pda"
              placeholder="e.g. 4Aj4QkJa…9XnHg2pE"
              value={streamPda}
              onChange={(e) => setStreamPda(e.target.value.trim())}
              spellCheck={false}
              autoComplete="off"
              className="mt-2 rounded-[6px] border-white/15 bg-white/[0.04] font-mono text-foreground placeholder:text-foreground/35"
            />
            {streamPda.length > 0 && !isValidPda && (
              <p className="mt-2 text-xs text-destructive">
                Solana addresses are usually 32–44 base58 chars.
              </p>
            )}
            {isValidPda && <StreamPreview pda={streamPda} />}
          </Step>

          <Step number="02" title="Set terms">
            <Toggle
              label="Bid-only listing (no asking price)"
              hint="Buyers can only place bids; you accept manually."
              checked={bidOnly}
              onChange={setBidOnly}
            />

            {!bidOnly && (
              <div className="mt-5">
                <Label htmlFor="asking" className="text-foreground/80">
                  Asking price · USDC
                </Label>
                <Input
                  id="asking"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  placeholder="0.00"
                  value={askingPriceUsdc}
                  onChange={(e) => setAskingPriceUsdc(e.target.value)}
                  className="mt-2 rounded-[6px] border-white/15 bg-white/[0.04] font-mono text-foreground placeholder:text-foreground/35"
                />
                <p className="mt-2 text-xs text-foreground/55">
                  Buyers can hit Buy Now at this price for instant settlement.
                </p>
              </div>
            )}

            <div className="mt-5">
              <Label htmlFor="expiry" className="text-foreground/80">
                Listing expires in (hours)
              </Label>
              <Input
                id="expiry"
                type="number"
                min={1}
                max={720}
                value={expiryHours}
                onChange={(e) => setExpiryHours(Number(e.target.value))}
                className="mt-2 rounded-[6px] border-white/15 bg-white/[0.04] font-mono text-foreground"
              />
              <p className="mt-2 text-xs text-foreground/55">
                Auto-cancels and refunds open bids after this window.
              </p>
            </div>
          </Step>

          <Step number="03" title="Review">
            <ReviewBox
              streamPda={streamPda}
              bidOnly={bidOnly}
              askingPriceUsdc={askingPriceUsdc}
              expiryHours={expiryHours}
            />
          </Step>

          <div className="mt-2 flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
            <p className="max-w-md text-xs leading-relaxed text-foreground/55">
              Submitting signs one Solana tx that moves your Streamflow
              recipient authority to the listing PDA. Cancel any time.
            </p>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className={cn(
                "group inline-flex h-14 items-center justify-center gap-2 rounded-[10px] bg-white px-9 text-base font-medium text-black transition-all",
                "hover:bg-brand-ice active:translate-y-px",
                "disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-foreground/45 disabled:hover:bg-white/20",
              )}
            >
              {submitting ? "Submitting…" : "Create Listing"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

// ─── Local primitives ─────────────────────────────────────────────────

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <ElectricBorder
      color="#EAB308"
      speed={1}
      chaos={0.11}
      borderRadius={8}
      className=""
      style={{ borderRadius: 8 }}
    >
      <section className="rounded-[8px] bg-card px-6 py-7 md:px-8 md:py-8">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            / {number}
          </span>
          <h2 className="font-display text-xl font-semibold uppercase tracking-tight text-white md:text-2xl">
            {title}
          </h2>
        </div>
        <div className="mt-5">{children}</div>
      </section>
    </ElectricBorder>
  );
}

function ConnectPrompt() {
  return (
    <div className="mt-8 flex items-start gap-3 rounded-[8px] border border-brand-violet/30 bg-brand-violet/10 px-5 py-4 text-sm text-foreground">
      <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-brand-violet" />
      <div>
        <span className="font-medium">Connect your wallet first.</span>
        <span className="ml-1 text-foreground/65">
          Listing requires a signed transaction from the maker.
        </span>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-[6px] border border-white/15 bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-white/30"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="text-xs text-foreground/55">{hint}</span>}
      </span>
      <span
        className={cn(
          "relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-violet" : "bg-foreground/20",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}

function StreamPreview({ pda }: { pda: string }) {
  return (
    <div className="mt-5 rounded-[8px] border border-white/15 bg-white/[0.04] px-5 py-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <LockKeyhole className="h-3 w-3" />
        Stream preview · mock
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        <Row label="PDA" value={`${pda.slice(0, 6)}…${pda.slice(-6)}`} mono />
        <Row label="Locked amount" value="— LP" mono dim />
        <Row label="Unlock date" value="—" mono dim />
        <Row label="Token" value="—" dim />
      </dl>
      <p className="mt-3 text-xs text-foreground/45">
        Live metadata fetched from Streamflow on M2.
      </p>
    </div>
  );
}

function ReviewBox({
  streamPda,
  bidOnly,
  askingPriceUsdc,
  expiryHours,
}: {
  streamPda: string;
  bidOnly: boolean;
  askingPriceUsdc: string;
  expiryHours: number;
}) {
  const rows = [
    {
      label: "Stream",
      value: streamPda
        ? `${streamPda.slice(0, 6)}…${streamPda.slice(-6)}`
        : "—",
      mono: true,
    },
    {
      label: "Asking price",
      value: bidOnly
        ? "Bid-only"
        : askingPriceUsdc
          ? `${askingPriceUsdc} USDC`
          : "—",
      mono: !bidOnly,
    },
    { label: "Expires in", value: `${expiryHours}h`, mono: true },
  ];
  return (
    <dl className="flex flex-col">
      {rows.map((r) => (
        <Row key={r.label} {...r} bordered />
      ))}
    </dl>
  );
}

function Row({
  label,
  value,
  mono = false,
  dim = false,
  bordered = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  dim?: boolean;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2 text-sm",
        bordered && "border-b border-white/5 last:border-b-0",
      )}
    >
      <dt className="text-foreground/65">{label}</dt>
      <dd
        className={cn(
          mono && "font-mono",
          dim ? "text-foreground/40" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
