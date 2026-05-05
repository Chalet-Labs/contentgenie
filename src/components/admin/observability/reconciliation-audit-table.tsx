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
