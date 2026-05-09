import { Syne, Outfit, JetBrains_Mono } from "next/font/google";

/**
 * LOCK N ROLL Neon design system fonts.
 * - Syne: display headings (geometric, distinctive Web3 feel)
 * - Outfit: body / UI text
 * - JetBrains Mono: prices, addresses, code fragments
 */
export const fontDisplay = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const fontSans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
