import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  Check,
  LockKeyhole,
  Plus,
  RefreshCw,
} from "lucide-react";

import GridMotionField from "@/components/GridMotionField";
import GridScanField from "@/components/GridScanField";
import HyperspeedField from "@/components/HyperspeedField";
import LazyOnView from "@/components/lazy-on-view";
import Shuffle from "@/components/Shuffle";
import SplitText from "@/components/SplitText";
import { ListingCard } from "@/components/domain/listing-card";
import { MOCK_ACTIVE_LISTING_VIEWS } from "@/lib/mock";
import { cn } from "@/lib/utils";

export default function Home() {
  const previewListings = MOCK_ACTIVE_LISTING_VIEWS.slice(0, 3);

  return (
    <div className="overflow-hidden bg-black">
      {/* ──────────────────────────  HERO  ─────────────────────────── */}
      {/* Mirrors ctrl.xyz "Take [logo]" treatment — logo glyph embedded
          inline inside the headline, single CTA, clean canvas. */}
      <section className="relative isolate overflow-hidden bg-black">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-55"
        >
          <GridMotionField
            gradientColor="transparent"
            items={[
              "#ffb800", "#000000", "#e23eff", "#ffffff", "#000000", "#0099ff", "#ffb800",
              "#0099ff", "#ffb800", "#000000", "#e23eff", "#ffb800", "#000000", "#e23eff",
              "#e23eff", "#000000", "#ffb800", "#0099ff", "#000000", "#ffffff", "#ffb800",
              "#000000", "#0099ff", "#e23eff", "#000000", "#ffb800", "#000000", "#0099ff",
            ]}
          />
        </div>
        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-80px)] max-w-6xl flex-col items-center justify-center px-6 py-24 text-center md:py-32">
          <h1 className="font-robot font-bold tracking-normal text-white">
            {/* Line 1: LOCK [logo inline] */}
            <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <Shuffle
                text="LOCK"
                tag="span"
                shuffleDirection="right"
                duration={0.55}
                shuffleTimes={2}
                animationMode="evenodd"
                stagger={0.04}
                triggerOnce
                triggerOnHover
                className="font-robot font-bold tracking-normal text-white"
                style={{
                  display: "inline-block",
                  fontSize: "clamp(72px, 15vw, 176px)",
                  lineHeight: 0.92,
                  textTransform: "uppercase",
                }}
              />
              <Image
                src="/brand/lock-n-roll-logo-transparent.png"
                alt=""
                width={200}
                height={200}
                priority
                className="hero-logo-float h-[clamp(66px,13.8vw,162px)] w-[clamp(66px,13.8vw,162px)] object-contain"
              />
            </span>
            {/* Line 2: N(accent) ROLL */}
            <span className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <Shuffle
                text="N"
                tag="span"
                shuffleDirection="right"
                duration={0.55}
                shuffleTimes={2}
                animationMode="evenodd"
                stagger={0.04}
                triggerOnce
                triggerOnHover
                className="font-robot font-bold tracking-normal"
                style={{
                  display: "inline-block",
                  fontSize: "clamp(72px, 15vw, 176px)",
                  lineHeight: 0.92,
                  textTransform: "uppercase",
                  color: "var(--brand-violet)",
                }}
              />
              <Shuffle
                text="ROLL"
                tag="span"
                shuffleDirection="right"
                duration={0.55}
                shuffleTimes={2}
                animationMode="evenodd"
                stagger={0.04}
                triggerOnce
                triggerOnHover
                className="font-robot font-bold tracking-normal text-white"
                style={{
                  display: "inline-block",
                  fontSize: "clamp(72px, 15vw, 176px)",
                  lineHeight: 0.92,
                  textTransform: "uppercase",
                }}
              />
            </span>
          </h1>

          <p className="hero-copy mt-10 max-w-2xl text-balance font-display text-lg font-normal uppercase leading-relaxed text-white/80 sm:text-xl md:text-[22px] md:leading-[1.45]">
            Trade locked vesting tokens — without unlocking them. Streamflow
            keeps custody. Only the recipient right moves, atomically with
            USDC.
          </p>

          <Link
            href="/market"
            className="group mt-12 inline-flex h-16 items-center justify-center gap-2 rounded-button-lg bg-white px-10 text-base font-medium text-black transition-all hover:bg-brand-ice active:translate-y-px"
          >
            Open Market
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* ───────────────  VALUE PROP — single big claim  ─────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-32 text-center md:pb-44">
        <h2 className="font-display text-[clamp(40px,7vw,90px)] font-semibold uppercase leading-[0.95] tracking-normal text-primary">
          Every locked stream.<br />
          One protocol.
        </h2>
        <p className="mx-auto mt-7 max-w-xl text-balance font-display text-base font-normal uppercase leading-relaxed text-muted-foreground md:text-lg">
          Lock N Roll lists Streamflow vesting contracts as tradable
          rights. The token never leaves the original stream — just the
          recipient does.
        </p>
      </section>

      {/* ─────────────  TRUST CARDS — 3 large pill cards  ─────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-32 md:pb-44">
        <div className="grid gap-5 md:grid-cols-3">
          <FeatureCard
            tone="charcoal"
            kicker="01 / Custody"
            title="Streamflow-native"
            body="Locked tokens stay in the original vesting contract. No unwrap, no shadow stream, no wrapper token."
          />
          <FeatureCard
            tone="violet"
            kicker="02 / Settlement"
            title="PDA settlement"
            body="The listing PDA holds the recipient authority — never the underlying token. The program enforces atomic swaps."
          />
          <FeatureCard
            tone="pebble"
            kicker="03 / Bids"
            title="Refundable bids"
            body="Open bids stay withdrawable after a listing is sold or cancelled. No capital ever stuck in escrow."
          />
        </div>
      </section>

      {/* ────────────────────  SETTLEMENT PATH  ───────────────────── */}
      <section className="relative isolate overflow-hidden bg-black">
        {/* Hyperspeed cyberpunk tunnel — full-bleed, behind content */}
        <LazyOnView
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-90"
        >
          <HyperspeedField preset="one" />
        </LazyOnView>
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-32 text-center md:py-44">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            / Settlement path
          </span>
          <h2 className="mx-auto mt-4 max-w-4xl font-display text-[clamp(40px,7vw,90px)] font-semibold leading-[0.95] tracking-normal text-primary">
            The token stays locked.
            <br />
            The right changes hands.
          </h2>
          <p className="mx-auto mt-7 max-w-2xl text-balance font-display text-base font-normal uppercase leading-relaxed text-muted-foreground md:text-lg">
            Three steps, one Solana transaction. The stream contract never
            knows it changed owners.
          </p>

          <div className="mt-16 grid gap-4 text-left md:grid-cols-3">
            <StepCard
              icon={<LockKeyhole className="h-5 w-5" />}
              step="01"
              title="List the stream"
              text="The maker selects an eligible Streamflow Vesting contract and transfers recipient authority to the listing PDA."
            />
            <StepCard
              icon={<RefreshCw className="h-5 w-5" />}
              step="02"
              title="Transfer the right"
              text="Buy Now or Accept Bid moves the recipient right from the listing PDA straight to the buyer in a single instruction."
            />
            <StepCard
              icon={<BadgeDollarSign className="h-5 w-5" />}
              step="03"
              title="Settle in USDC"
              text="USDC pays the maker on the same path while losing bids remain refundable — no funds stuck in escrow."
            />
          </div>
        </div>
      </section>

      {/* ─────────────────────  SECURITY / TRUST  ──────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-32 md:py-44">
        <div className="grid items-center gap-16 md:grid-cols-2">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              / Trust model
            </span>
            <h2 className="mt-4 font-display text-[clamp(36px,6vw,72px)] font-semibold uppercase leading-[0.95] tracking-normal text-primary">
              The secure way<br />
              to trade locked tokens.
            </h2>
            <p className="mt-7 max-w-md text-balance font-display text-base font-normal uppercase leading-relaxed text-muted-foreground md:text-lg">
              No custody, no approvals beyond Streamflow itself, no proprietary
              wrapper. Every step is verifiable on-chain.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            <TrustBullet text="Streamflow Vesting recipient transfer — no token movement." />
            <TrustBullet text="Atomic settlement — recipient and USDC swap in one tx." />
            <TrustBullet text="Refundable bids — losing bids withdraw at any time." />
            <TrustBullet text="No protocol custody — listings hold authority, not assets." />
          </ul>
        </div>
      </section>

      {/* ─────────────────────  MARKET PREVIEW  ───────────────────── */}
      <section className="relative isolate overflow-hidden bg-black">
        {/* GridScan — full-bleed scan-line grid, behind content */}
        <LazyOnView
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
        >
          <GridScanField
            sensitivity={0.45}
            lineThickness={1.5}
            linesColor="#2F293A"
            scanColor="#ffffff"
            scanOpacity={0.4}
            gridScale={0.1}
            lineStyle="solid"
            lineJitter={0.05}
            scanDirection="pingpong"
            noiseIntensity={0.01}
            scanGlow={0.5}
            scanSoftness={2.5}
            scanDuration={2}
            scanDelay={2}
            scanOnClick={false}
          />
        </LazyOnView>
        <div className="relative z-10 mx-auto max-w-7xl px-6 py-32 md:py-44">
          <div className="text-center">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              / Market preview
            </span>
            <h2 className="mx-auto mt-4 max-w-3xl font-display text-[clamp(40px,7vw,90px)] font-semibold leading-[0.95] tracking-normal text-primary">
              Locked-token<br />
              opportunities, live.
            </h2>
          </div>

          <div className="mt-16 grid gap-4 md:grid-cols-3">
            {previewListings.map((listing) => (
              <ListingCard key={listing.listingPda} listing={listing} />
            ))}
          </div>

          <div className="mt-12 flex justify-center">
            <Link
              href="/market"
              className="group inline-flex h-14 items-center gap-2 rounded-button-lg border border-foreground bg-card px-8 text-sm font-medium text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              Open full market
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ────────────────────────────  FAQ  ──────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-32 md:py-44">
        <div className="text-center">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            / FAQ
          </span>
          <h2 className="mt-4 font-display text-[clamp(36px,6vw,72px)] font-semibold leading-[0.95] tracking-normal text-primary">
            Common questions
          </h2>
        </div>

        <div className="mt-14 flex flex-col gap-3">
          <FaqItem question="How is custody handled?">
            The Streamflow Vesting contract continues to hold the locked
            tokens for its full duration. We only transfer the{" "}
            <strong>recipient authority</strong> from the maker to the
            listing PDA, then onward to the buyer at settlement.
          </FaqItem>
          <FaqItem question="What happens if my bid loses?">
            Losing bids stay refundable. The listing program lets any
            losing bidder pull their USDC back at any time after the
            winner is chosen — there is no settlement window blocking
            withdrawals.
          </FaqItem>
          <FaqItem question="Which tokens are eligible?">
            Any SPL token streamed through a public Streamflow Vesting
            program is eligible, provided the recipient role can be
            transferred and the stream has not been cancelled.
          </FaqItem>
          <FaqItem question="What fees does the protocol charge?">
            A flat protocol fee (currently 1%) is taken from the seller
            side at settlement. Buyers pay only the listing price plus
            standard Solana network fees.
          </FaqItem>
          <FaqItem question="How fast does settlement happen?">
            Settlement is a single Solana transaction — typically under a
            second. The recipient right and USDC move atomically; either
            both transfer or neither does.
          </FaqItem>
        </div>
      </section>

      {/* ────────────────────────  FINAL CTA  ──────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-32 text-center md:py-44">
        <SplitText
          text="Roll your locked stream."
          tag="h2"
          className="max-w-3xl font-display text-[clamp(40px,7vw,90px)] font-semibold leading-[0.95] tracking-normal text-brand-yellow"
          delay={50}
          duration={1.25}
          ease="power3.out"
          splitType="chars"
          from={{ opacity: 0, y: 40 }}
          to={{ opacity: 1, y: 0 }}
          threshold={0.1}
          rootMargin="-100px"
          textAlign="center"
        />
        <p className="mx-auto mt-6 max-w-xl text-balance font-display text-base font-normal uppercase leading-relaxed text-muted-foreground md:text-lg">
          Connect a wallet, pick a vesting contract, list it in under a
          minute. The recipient right transfers atomically.
        </p>
        <Link
          href="/create"
          className="group mt-10 inline-flex h-16 items-center justify-center gap-2 rounded-button-lg bg-primary px-10 text-base font-medium text-primary-foreground transition-all hover:bg-foreground active:translate-y-px"
        >
          Create Listing
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </section>

      {/* ─────────────────────────  FOOTER  ──────────────────────────── */}
      <footer className="border-t border-border bg-black">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 text-foreground"
            >
              <Image
                src="/brand/lock-n-roll-logo-transparent.png"
                alt="LOCK N ROLL"
                width={36}
                height={36}
                className="h-9 w-9 rounded-full bg-card object-contain"
              />
              <span className="font-display text-base font-semibold uppercase tracking-normal">
                Lock N Roll
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Streamflow-native OTC for locked vesting tokens on Solana.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              { href: "/market", label: "Market" },
              { href: "/create", label: "Create listing" },
              { href: "/dashboard", label: "Dashboard" },
            ]}
          />
          <FooterCol
            title="Resources"
            links={[
              { href: "https://streamflow.finance", label: "Streamflow", external: true },
              { href: "/", label: "Docs" },
              { href: "/", label: "FAQ" },
            ]}
          />
          <FooterCol
            title="Community"
            links={[
              { href: "/", label: "X / Twitter", external: true },
              { href: "/", label: "Discord", external: true },
              { href: "/", label: "GitHub", external: true },
            ]}
          />
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>© 2025 Lock N Roll. All rights reserved.</span>
            <div className="flex gap-6">
              <Link href="/" className="hover:text-foreground">Terms</Link>
              <Link href="/" className="hover:text-foreground">Privacy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Local primitives ─────────────────────────────────────────────────

function FeatureCard({
  tone,
  kicker,
  title,
  body,
}: {
  tone: "charcoal" | "ice" | "pebble" | "violet";
  kicker: string;
  title: string;
  body: string;
}) {
  const toneStyles = {
    charcoal: "bg-brand-charcoal text-white",
    ice: "bg-brand-ice text-foreground",
    pebble: "bg-secondary text-foreground",
    violet: "bg-brand-violet/25 text-foreground",
  } as const;
  const darkTone = tone === "charcoal";
  return (
    <div
      className={cn(
        "group/card flex h-full flex-col rounded-[36px] p-9 transition-transform duration-200 hover:-translate-y-1 md:p-11",
        toneStyles[tone],
      )}
    >
      <span
        className={cn(
          "text-[11px] font-medium uppercase tracking-[0.18em]",
          darkTone ? "text-white/60" : "text-foreground/55",
        )}
      >
        {kicker}
      </span>
      <h3 className="mt-6 font-display text-3xl font-semibold leading-[1.05] tracking-normal md:text-4xl">
        {title}
      </h3>
      <p
        className={cn(
          "mt-5 text-sm leading-relaxed md:text-base",
          darkTone ? "text-white/78" : "text-foreground/75",
        )}
      >
        {body}
      </p>
    </div>
  );
}

function StepCard({
  icon,
  step,
  title,
  text,
}: {
  icon: ReactNode;
  step: string;
  title: string;
  text: string;
}) {
  return (
    <div className="group/step flex h-full flex-col rounded-[28px] bg-card p-8 transition-colors hover:bg-background md:p-9">
      <div className="flex items-center justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-ice text-brand-charcoal transition-colors group-hover/step:bg-brand-violet group-hover/step:text-white">
          {icon}
        </div>
        <span className="font-mono text-sm text-muted-foreground">{step}</span>
      </div>
      <h3 className="mt-8 font-display text-2xl font-semibold leading-tight tracking-normal text-foreground">
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {text}
      </p>
    </div>
  );
}

function TrustBullet({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-4 rounded-[24px] bg-card p-5 md:p-6">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
      <span className="text-base leading-snug text-foreground md:text-lg">
        {text}
      </span>
    </li>
  );
}

function FaqItem({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  return (
    <details className="group/faq rounded-[28px] bg-secondary px-6 py-5 transition-colors open:bg-card md:px-8 md:py-6 [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer items-center justify-between gap-6 text-left">
        <span className="font-display text-lg font-medium leading-snug tracking-normal text-foreground md:text-xl">
          {question}
        </span>
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-foreground/15 bg-card transition-colors group-open/faq:border-brand-violet group-open/faq:bg-brand-violet group-open/faq:text-white">
          <Plus className="h-4 w-4 transition-transform duration-200 group-open/faq:rotate-45" />
        </span>
      </summary>
      <div className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/75 md:text-base">
        {children}
      </div>
    </details>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string; external?: boolean }[];
}) {
  return (
    <div>
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </span>
      <ul className="mt-5 flex flex-col gap-3">
        {links.map((link) => (
          <li key={`${title}-${link.label}`}>
            <Link
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noreferrer" : undefined}
              className="text-sm text-foreground/80 transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
