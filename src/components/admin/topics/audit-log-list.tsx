import type { AdminAuditRow } from "@/lib/admin/topic-queries";

interface AuditLogListProps {
  rows: AdminAuditRow[];
}

export function AuditLogList({ rows }: AuditLogListProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No audit log entries.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between">
            <span>
              <strong className="capitalize">{row.action}</strong>
              {" · "}
              loser <strong>#{row.loserId}</strong>
              {" → "}
              winner <strong>#{row.winnerId}</strong>
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(row.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            by {row.actor}
          </div>
        </li>
      ))}
    </ul>
  );
}
