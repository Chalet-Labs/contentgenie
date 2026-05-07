import "server-only";

import { db } from "@/db";
import { reconciliationLog } from "@/db/schema";
import { desc, sql, and, count } from "drizzle-orm";
import type { ReconciliationLog } from "@/db/schema";

export type { WindowKey } from "@/lib/search-params/admin-topics-observability";

export type ReconciliationAuditEntry = ReconciliationLog;

export interface ReconciliationAuditPage {
  rows: ReconciliationAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export const DEFAULT_AUDIT_PAGE_SIZE = 50;

function buildAuditTimeFilter(window?: { start: Date; end: Date }) {
  if (!window) return undefined;
  // `createdAt` is `timestamp without time zone`; reinterpret as UTC before
  // comparing so the window math is independent of session TZ.
  const col = reconciliationLog.createdAt;
  return and(
    sql`(${col} AT TIME ZONE 'UTC') >= ${window.start}`,
    sql`(${col} AT TIME ZONE 'UTC') <= ${window.end}`,
  );
}

/**
 * Returns a page of per-cluster audit rows for the given time window, ordered
 * by `created_at DESC`. Reads from the `reconciliation_log` table written by
 * the nightly reconciliation task (ADR-053 §1, issue #392).
 *
 * @param window    Optional `{ start, end }` filter on `created_at`.
 * @param page      1-indexed page number (default 1).
 * @param pageSize  Rows per page (default 50).
 */
export async function getReconciliationAuditLog(
  window?: { start: Date; end: Date },
  page = 1,
  pageSize = DEFAULT_AUDIT_PAGE_SIZE,
): Promise<ReconciliationAuditPage> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const timeFilter = buildAuditTimeFilter(window);

  const baseCount = db.select({ value: count() }).from(reconciliationLog);
  const filteredCount = timeFilter ? baseCount.where(timeFilter) : baseCount;
  const countRows = await filteredCount;
  const total = Number(countRows[0]?.value ?? 0);

  // Clamp out-of-range pages (e.g. `?auditPage=999` or stale URLs after a
  // filter change) to the last populated page so the table shows real rows
  // instead of an empty "no activity" view.
  const lastPage = Math.max(1, Math.ceil(total / safePageSize));
  const clampedPage = Math.min(safePage, lastPage);

  const baseRows = db.select().from(reconciliationLog);
  const filteredRows = timeFilter ? baseRows.where(timeFilter) : baseRows;
  const rows = await filteredRows
    .orderBy(desc(reconciliationLog.createdAt), desc(reconciliationLog.id))
    .limit(safePageSize)
    .offset((clampedPage - 1) * safePageSize);

  const hasMore = clampedPage * safePageSize < total;

  return {
    rows,
    total,
    page: clampedPage,
    pageSize: safePageSize,
    hasMore,
  };
}
