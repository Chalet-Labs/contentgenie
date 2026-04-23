import { useId } from "react";
import { cn } from "@/lib/utils";

export type LogoVariant = "mark" | "mark-mono" | "lockup";

interface LogoProps {
  variant?: LogoVariant;
  className?: string;
  size?: number;
  /** Accessible label. Ignored when `decorative` is true. */
  label?: string;
  /** When true, renders with `aria-hidden` — for spots where adjacent text already names the logo. */
  decorative?: boolean;
}

/**
 * ContentGenie brand mark — amber tile + ink speech-bubble-with-soundwave glyph.
 *
 * - `mark`: colored tile, renders at any square size (default 24)
 * - `mark-mono`: single-color glyph tinted by `currentColor` — use inside
 *   contexts where the surrounding color matters more than the brand accent
 * - `lockup`: mark + "ContentGenie" wordmark; wordmark fill flips for dark mode
 */
export function Logo({
  variant = "mark",
  className,
  size,
  label = "ContentGenie",
  decorative = false,
}: LogoProps) {
  const a11y = decorative
    ? { "aria-hidden": true }
    : { role: "img" as const, "aria-label": label };
  const maskId = useId();

  if (variant === "lockup") {
    const dimension = size ?? 32;
    return (
      <svg
        viewBox="0 0 210 44"
        width={(dimension * 210) / 44}
        height={dimension}
        className={cn("shrink-0", className)}
        fill="none"
        {...a11y}
      >
        <rect x="0" y="6" width="32" height="32" rx="7" fill="hsl(var(--brand))" />
        <g transform="translate(0 6)">
          <path
            d="M7 8 h18 a3 3 0 0 1 3 3 v8 a3 3 0 0 1 -3 3 h-10 l-5 4 v-4 h-3 a3 3 0 0 1 -3 -3 v-8 a3 3 0 0 1 3 -3 z"
            fill="hsl(var(--brand-foreground))"
          />
          <rect x="11.5" y="14" width="2" height="3" rx="1" fill="hsl(var(--brand))" />
          <rect x="15.5" y="11.5" width="2" height="8" rx="1" fill="hsl(var(--brand))" />
          <rect x="19.5" y="13" width="2" height="5" rx="1" fill="hsl(var(--brand))" />
        </g>
        <text
          x="44"
          y="30"
          fontFamily="var(--font-sans, Inter, sans-serif)"
          fontWeight={700}
          fontSize="22"
          letterSpacing="-0.035em"
          fill="hsl(var(--foreground))"
        >
          ContentGenie
        </text>
      </svg>
    );
  }

  const dimension = size ?? 24;

  if (variant === "mark-mono") {
    return (
      <svg
        viewBox="0 0 32 32"
        width={dimension}
        height={dimension}
        className={cn("shrink-0", className)}
        fill="none"
        {...a11y}
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
            <path
              d="M7 8 h18 a3 3 0 0 1 3 3 v8 a3 3 0 0 1 -3 3 h-10 l-5 4 v-4 h-3 a3 3 0 0 1 -3 -3 v-8 a3 3 0 0 1 3 -3 z"
              fill="white"
            />
            <rect x="11.5" y="14" width="2" height="3" rx="1" fill="black" />
            <rect x="15.5" y="11.5" width="2" height="8" rx="1" fill="black" />
            <rect x="19.5" y="13" width="2" height="5" rx="1" fill="black" />
          </mask>
        </defs>
        <rect width="32" height="32" fill="currentColor" mask={`url(#${maskId})`} />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 32 32"
      width={dimension}
      height={dimension}
      className={cn("shrink-0", className)}
      fill="none"
      {...a11y}
    >
      <rect width="32" height="32" rx="7" fill="hsl(var(--brand))" />
      <path
        d="M7 8 h18 a3 3 0 0 1 3 3 v8 a3 3 0 0 1 -3 3 h-10 l-5 4 v-4 h-3 a3 3 0 0 1 -3 -3 v-8 a3 3 0 0 1 3 -3 z"
        fill="hsl(var(--brand-foreground))"
      />
      <rect x="11.5" y="14" width="2" height="3" rx="1" fill="hsl(var(--brand))" />
      <rect x="15.5" y="11.5" width="2" height="8" rx="1" fill="hsl(var(--brand))" />
      <rect x="19.5" y="13" width="2" height="5" rx="1" fill="hsl(var(--brand))" />
    </svg>
  );
}
