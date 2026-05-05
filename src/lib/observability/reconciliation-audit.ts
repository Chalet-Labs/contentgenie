import "server-only";

import { db } from "@/db";
import { reconciliationLog } from "@/db/schema";
import { desc, gte, lte, and } from "drizzle-orm";
import type { ReconciliationLog } from "@/db/schema";

export type { WindowKey } from "@/lib/search-params/admin-topics-observability";

export type ReconciliationAuditEntry = ReconciliationLog;

function buildAuditTimeFilter(window?: { start: Date; end: Date }) {
  if (!window) return undefined;
  return and(
    gte(reconciliationLog.createdAt, window.start),
    lte(reconciliationLog.createdAt, window.end),
  );
}

/**
 * Returns recent per-cluster audit rows for the given time window, ordered by
 * `created_at DESC`. Reads from the `reconciliation_log` table written by the
 * nightly reconciliation task (ADR-053 §1).
 *
 * @param window  Optional `{ start, end }` filter on `created_at`.
 * @param limit   Maximum rows to return (default 50).
 */
export async function getReconciliationAuditLog(
  window?: { start: Date; end: Date },
  limit = 50,
): Promise<ReconciliationAuditEntry[]> {
  const timeFilter = buildAuditTimeFilter(window);

  const base = db.select().from(reconciliationLog);
  const filtered = timeFilter ? base.where(timeFilter) : base;
  return filtered
    .orderBy(desc(reconciliationLog.createdAt), desc(reconciliationLog.id))
    .limit(limit);
}
