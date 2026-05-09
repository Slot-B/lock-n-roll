import Link from "next/link";
import Image from "next/image";
import { ConnectButton } from "./connect-button";
import { NetworkToggle } from "./network-toggle";

const NAV = [
  { href: "/market", label: "Market" },
  { href: "/create", label: "Create" },
  { href: "/dashboard", label: "Dashboard" },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 md:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 rounded-pill text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <Image
            src="/brand/lock-n-roll-logo-transparent.png"
            alt="LOCK N ROLL logo"
            width={36}
            height={36}
            className="h-9 w-9 object-contain"
            priority
          />
          <span className="font-display text-base font-semibold uppercase tracking-tight">
            Lock&nbsp;N&nbsp;Roll
          </span>
        </Link>

        <div className="flex items-center gap-2 md:gap-6">
          <nav className="hidden items-center gap-6 text-sm md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-medium text-foreground/75 transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <NetworkToggle />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
