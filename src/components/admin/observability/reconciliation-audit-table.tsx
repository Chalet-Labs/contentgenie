import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/admin/format-utils";
import type { ReconciliationAuditEntry } from "@/lib/observability/reconciliation-audit";

interface ReconciliationAuditTableProps {
  entries: ReconciliationAuditEntry[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  /**
   * Builds the href for a given audit page number, preserving the rest of
   * the page's query state (window, granularity). The page passes a closure
   * so the table stays decoupled from the search-params shape.
   */
  pageHref: (page: number) => string;
}

/**
 * Per-cluster reconciliation audit list (issue #392 AC).
 *
 * The "Verified / Rejected" column doubles as a count chip and an ID list:
 * the top line is the integer counts, and below it the actual loser IDs are
 * stacked under "verified:" / "rejected:" labels so operators can correlate
 * a `partial` or `rejected` outcome with the specific cluster members that
 * caused it. The ID list collapses when both groups are empty (e.g.
 * `skipped`, `failed`) so dormant rows stay compact.
 */

type Outcome = ReconciliationAuditEntry["outcome"];

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const map: Record<
    Outcome,
    {
      variant: "default" | "secondary" | "destructive" | "outline";
      className?: string;
    }
  > = {
    merged: {
      variant: "default",
      className:
        "bg-emerald-600 text-white border-transparent hover:bg-emerald-600/80",
    },
    partial: {
      variant: "outline",
      className: "border-amber-400 text-amber-700 bg-amber-50",
    },
    rejected: { variant: "destructive" },
    skipped: { variant: "outline", className: "text-muted-foreground" },
    failed: { variant: "destructive" },
  };
  const { variant, className } = map[outcome];
  return (
    <Badge variant={variant} className={className}>
      {outcome}
    </Badge>
  );
}

export function ReconciliationAuditTable({
  entries,
  page,
  pageSize,
  total,
  hasMore,
  pageHref,
}: ReconciliationAuditTableProps) {
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = hasMore;

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>Cluster</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Winner</TableHead>
            <TableHead>Verified / Rejected</TableHead>
            <TableHead>Merges</TableHead>
            <TableHead>Outcome</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center text-sm text-muted-foreground"
              >
                No reconciliation activity in this window.
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {relativeTime(entry.createdAt)}
                </TableCell>
                <TableCell className="text-sm">#{entry.clusterIndex}</TableCell>
                <TableCell className="text-sm">{entry.clusterSize}</TableCell>
                <TableCell className="text-sm">
                  {entry.winnerId !== null ? entry.winnerId : "—"}
                </TableCell>
                <TableCell className="text-sm">
                  <div className="space-y-1">
                    <div>
                      <span className="text-emerald-700">
                        {entry.verifiedLoserIds.length}
                      </span>
                      {" / "}
                      <span
                        className={
                          entry.rejectedLoserIds.length > 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                        }
                      >
                        {entry.rejectedLoserIds.length}
                      </span>
                    </div>
                    {(entry.verifiedLoserIds.length > 0 ||
                      entry.rejectedLoserIds.length > 0) && (
                      <div className="font-mono text-xs leading-tight">
                        {entry.verifiedLoserIds.length > 0 && (
                          <div className="text-emerald-700/80">
                            <span className="text-muted-foreground">
                              verified:
                            </span>{" "}
                            {entry.verifiedLoserIds.join(", ")}
                          </div>
                        )}
                        {entry.rejectedLoserIds.length > 0 && (
                          <div className="text-destructive/80">
                            <span className="text-muted-foreground">
                              rejected:
                            </span>{" "}
                            {entry.rejectedLoserIds.join(", ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  <div>
                    {entry.mergesExecuted} / {entry.mergesRejected}
                  </div>
                  {entry.pairwiseVerifyThrew > 0 && (
                    // mergesRejected counts model `same_entity=false` outcomes only;
                    // pairwise-verify throws are an infra signal, tracked separately.
                    // Surfacing the throw count makes the math reconcilable when
                    // rejectedLoserIds.length > mergesRejected.
                    <div className="text-xs text-amber-700">
                      +{entry.pairwiseVerifyThrew} threw
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <OutcomeBadge outcome={entry.outcome} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <nav
        aria-label="Audit log pagination"
        className="flex items-center justify-between gap-2 text-sm"
      >
        <span className="text-muted-foreground">
          {total === 0 ? "No rows" : `${firstRow}–${lastRow} of ${total}`}
        </span>
        <div className="flex gap-2">
          <Link
            href={pageHref(Math.max(1, page - 1))}
            aria-disabled={!hasPrev}
            tabIndex={hasPrev ? 0 : -1}
            className={cn(
              "rounded-md border px-3 py-1 text-sm font-medium transition-colors",
              hasPrev ? "hover:bg-muted" : "pointer-events-none opacity-50",
            )}
          >
            Prev
          </Link>
          <Link
            href={pageHref(page + 1)}
            aria-disabled={!hasNext}
            tabIndex={hasNext ? 0 : -1}
            className={cn(
              "rounded-md border px-3 py-1 text-sm font-medium transition-colors",
              hasNext ? "hover:bg-muted" : "pointer-events-none opacity-50",
            )}
          >
            Next
          </Link>
        </div>
      </nav>
    </div>
  );
}
