import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
        },
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        score: {
          exceptional: "hsl(var(--score-exceptional))",
          "exceptional-text": "hsl(var(--score-exceptional-text))",
          "exceptional-foreground": "hsl(var(--score-exceptional-foreground))",
          above: "hsl(var(--score-above))",
          "above-text": "hsl(var(--score-above-text))",
          "above-foreground": "hsl(var(--score-above-foreground))",
          average: "hsl(var(--score-average))",
          "average-text": "hsl(var(--score-average-text))",
          "average-foreground": "hsl(var(--score-average-foreground))",
          below: "hsl(var(--score-below))",
          "below-text": "hsl(var(--score-below-text))",
          "below-foreground": "hsl(var(--score-below-foreground))",
          skip: "hsl(var(--score-skip))",
          "skip-text": "hsl(var(--score-skip-text))",
          "skip-foreground": "hsl(var(--score-skip-foreground))",
        },
        status: {
          "success-bg": "hsl(var(--status-success-bg))",
          "success-text": "hsl(var(--status-success-text))",
          "success-border": "hsl(var(--status-success-border))",
          "warning-bg": "hsl(var(--status-warning-bg))",
          "warning-text": "hsl(var(--status-warning-text))",
          "warning-border": "hsl(var(--status-warning-border))",
          "info-bg": "hsl(var(--status-info-bg))",
          "info-text": "hsl(var(--status-info-text))",
          "info-border": "hsl(var(--status-info-border))",
          "danger-bg": "hsl(var(--status-danger-bg))",
          "danger-text": "hsl(var(--status-danger-text))",
          "danger-border": "hsl(var(--status-danger-border))",
          "neutral-bg": "hsl(var(--status-neutral-bg))",
          "neutral-text": "hsl(var(--status-neutral-text))",
          "neutral-border": "hsl(var(--status-neutral-border))",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
