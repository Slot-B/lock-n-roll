interface MarketHeroProps {
  activeCount: number;
  settledCount: number;
}

/**
 * Hero band on /market.
 * - Display headline uses Robot Dreamer for brand consistency.
 * - Right side shows two key counters.
 * - Decorative grid follows the logo palette without adding image dependency.
 */
export function MarketHero({ activeCount, settledCount }: MarketHeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-card">
      <DecorativeGrid />

      <div className="relative mx-auto max-w-7xl px-6 py-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand-blue">
              Streamflow-native OTC
            </div>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-normal text-primary md:text-6xl">
              Trade locked tokens
              <br />
              <span className="text-brand-violet">without unlocking</span>.
            </h1>
            <p className="mt-4 max-w-xl font-display text-sm font-normal uppercase leading-relaxed text-muted-foreground">
              The tokens stay in vesting. Only the right to receive moves.
              Discover open listings below — Buy Now to settle instantly, or
              Place Bid to negotiate price.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-10 gap-y-1 self-start md:self-end">
            <Stat label="Active listings" value={activeCount} />
            <Stat label="Settled trades" value={settledCount} />
          </dl>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-background px-5 py-4">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-3xl tabular-nums tracking-tight mt-1 text-primary">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

/** Right-side brand grid; pure decoration. */
function DecorativeGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-0">
      <div className="absolute right-0 top-0 h-full w-1/2 opacity-60">
        <div className="grid h-full grid-cols-12">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="border-l border-brand-ice"
              style={{
                opacity: i % 3 === 0 ? 0.6 : i % 2 === 0 ? 0.3 : 0.15,
              }}
            />
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 right-0 h-20 w-1/2 bg-brand-ice/50" />
    </div>
  );
}
