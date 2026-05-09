import Link from "next/link";
import { ConnectButton } from "./connect-button";
import { NetworkToggle } from "./network-toggle";

const NAV = [
  { href: "/market", label: "Market" },
  { href: "/create", label: "Create" },
  { href: "/dashboard", label: "Dashboard" },
] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link
          href="/market"
          className="font-display text-xl tracking-tight uppercase"
        >
          Lock <span className="text-primary">N</span> Roll
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <NetworkToggle />
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
