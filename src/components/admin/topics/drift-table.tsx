import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DriftRow } from "@/lib/admin/topic-queries";

interface DriftTableProps {
  rows: DriftRow[];
}

export function DriftTable({ rows }: DriftTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No merge-cleanup drift detected.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Merged Into</TableHead>
            <TableHead>Orphaned Junction Rows</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-sm text-muted-foreground">
                {row.id}
              </TableCell>
              <TableCell>
                <Link
                  href={`/admin/topics/${row.id}`}
                  className="hover:underline"
                >
                  {row.label}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {row.mergedIntoId ? (
                  <Link
                    href={`/admin/topics/${row.mergedIntoId}`}
                    className="hover:underline"
                  >
                    #{row.mergedIntoId}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-sm font-medium text-destructive">
                {row.junctionRowCount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
