import "server-only";

import type { AnyColumn, SQL } from "drizzle-orm";
import { and, sql } from "drizzle-orm";

/**
 * Bounded time-window predicate for a `timestamp without time zone` column.
 *
 * Reinterprets the bare timestamp as UTC before comparing so window math is
 * independent of session TZ. JS `Date` bounds are sent by the driver with
 * `+00`, matching the wrapped column.
 *
 * Note: wrapping the column blocks a plain btree index on the raw column.
 * Pair with a matching expression index — e.g.
 * `((col AT TIME ZONE 'UTC') DESC)` — when the predicate is on a hot path.
 */
export function buildUtcWindowFilter(
  col: AnyColumn,
  window?: { start: Date; end: Date },
): SQL | undefined {
  if (!window) return undefined;
  return and(
    sql`(${col} AT TIME ZONE 'UTC') >= ${window.start}`,
    sql`(${col} AT TIME ZONE 'UTC') <= ${window.end}`,
  );
}
