import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/admin/episodes/status-badge";
import { relativeTime } from "@/lib/admin/format-utils";
import type { RecentFailure } from "@/lib/admin/overview-queries";

interface RecentFailuresCardProps {
  failures: RecentFailure[];
}

export function RecentFailuresCard({ failures }: RecentFailuresCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Failures</CardTitle>
      </CardHeader>
      <CardContent>
        {failures.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent failures.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Episode</TableHead>
                <TableHead>Transcript</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failures.map((f) => {
                const error = f.transcriptError ?? f.processingError ?? null;
                return (
                  <TableRow key={f.id}>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {f.title}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={f.transcriptStatus} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={f.summaryStatus} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {relativeTime(f.updatedAt)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {error ? error.slice(0, 80) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
