import { Orbitron, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";

/**
 * LOCK N ROLL — typography
 * - Robot Dreamer: display headlines and short subheads
 * - Orbitron: display fallback
 * - Space Grotesk: descriptions, subtitles, body / UI text
 * - IBM Plex Mono: numbers, addresses, code fragments
 */
export const fontDisplay = Orbitron({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const fontSans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const fontRobotDreamer = localFont({
  variable: "--font-robot-dreamer",
  display: "swap",
  src: [
    {
      path: "./fonts/RobotDreamer-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/RobotDreamer-Italic.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "./fonts/RobotDreamer-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/RobotDreamer-BoldItalic.ttf",
      weight: "700",
      style: "italic",
    },
  ],
});
