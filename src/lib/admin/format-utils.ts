const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * Formats a Date as a human-readable relative time string (e.g. "5 minutes ago").
 * Covers minutes, hours, days, months, and years.
 */
export function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();

  const minutes = Math.round(diff / 60000);
  const hours = Math.round(diff / 3600000);
  const days = Math.round(diff / 86400000);
  const months = Math.round(diff / (86400000 * 30));
  const years = Math.round(diff / (86400000 * 365));

  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  if (Math.abs(days) < 30) return rtf.format(-days, "day");
  if (Math.abs(months) < 12) return rtf.format(-months, "month");
  return rtf.format(-years, "year");
}
