import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { fontDisplay, fontSans, fontMono } from "./fonts";
import { AppProviders } from "@/components/providers/app-providers";
import { Header } from "@/components/layout/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOCK N ROLL — Locked Token OTC on Solana",
  description:
    "Streamflow-Native OTC marketplace. Trade locked vesting tokens without unlocking — only the recipient right is transferred.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark",
        fontDisplay.variable,
        fontSans.variable,
        fontMono.variable,
      )}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground font-sans antialiased min-h-screen">
        <AppProviders>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
