import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
        },
        brand: {
          blue: "#587d9f",
          violet: "#cb6ce6",
          charcoal: "#30373f",
          ice: "#d6e0ed",
          mist: "#9babbf",
          canvas: "#f9faf9",
          gold: "#c89b3c",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        robot: [
          "var(--font-robot-dreamer)",
          "var(--font-display)",
          "system-ui",
          "sans-serif",
        ],
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "system-ui",
          "sans-serif",
        ],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        pill: "9999px",
        card: "17.56px",
        "card-lg": "26.34px",
        button: "35.12px",
        "button-lg": "52.68px",
        "2xl": "17.56px",
        "3xl": "26.34px",
        "4xl": "35.12px",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 1px)",
        sm: "calc(var(--radius) - 2px)",
      },
      spacing: {
        "9px": "9px",
        "11px": "11px",
        "13px": "13px",
        "18px": "18px",
        "26px": "26px",
        "31px": "31px",
        "35px": "35px",
        "42px": "42px",
        "44px": "44px",
        "53px": "53px",
        "55px": "55px",
        "70px": "70px",
        "105px": "105px",
        "149px": "149px",
      },
    },
  },
  plugins: [],
};

export default config;
