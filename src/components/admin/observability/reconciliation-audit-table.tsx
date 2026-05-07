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
}: ReconciliationAuditTableProps) {
  return (
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
                {entry.mergesExecuted} / {entry.mergesRejected}
              </TableCell>
              <TableCell>
                <OutcomeBadge outcome={entry.outcome} />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
