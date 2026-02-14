import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim()
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export interface FormatDateOptions {
  /** Include the year in the output. Defaults to `true`. */
  includeYear?: boolean;
}

/**
 * Format a date value into a human-readable string.
 *
 * Defaults to "MMM D, YYYY". Pass `{ includeYear: false }` for "MMM D".
 *
 * When passing a `number`, it must be in **milliseconds** (JS `Date` convention).
 * For Unix timestamps in seconds (e.g. PodcastIndex `datePublished`), use
 * {@link formatDateFromUnix} instead.
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  options?: FormatDateOptions,
): string {
  if (date == null) return "";

  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const { includeYear = true } = options ?? {};
  const formatOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  if (includeYear) {
    formatOptions.year = "numeric";
  }

  return d.toLocaleDateString("en-US", formatOptions);
}

/**
 * Format a Unix timestamp (seconds since epoch) into a human-readable string.
 *
 * Defaults to "MMM D, YYYY". Pass `{ includeYear: false }` for "MMM D".
 * Use this for PodcastIndex timestamps which are in seconds, not milliseconds.
 */
export function formatDateFromUnix(
  timestamp: number | null | undefined,
  options?: FormatDateOptions,
): string {
  if (timestamp == null) return "";
  return formatDate(timestamp * 1000, options);
}
