import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FailureTrendEntry } from "@/lib/admin/overview-queries";

interface FailureTrendCardProps {
  trend: FailureTrendEntry[];
}

export function FailureTrendCard({ trend }: FailureTrendCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Failure Trend (Last 7 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Failures</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trend.map((row) => (
              <TableRow key={row.day}>
                <TableCell className="text-sm">{row.day}</TableCell>
                <TableCell className="text-right text-sm">
                  {row.count > 0 ? (
                    <span className="font-medium text-destructive">
                      {row.count}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
