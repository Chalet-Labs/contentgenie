import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { RecentFailure } from "@/lib/admin/overview-queries"

interface RecentFailuresCardProps {
  failures: RecentFailure[]
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>

  const colorMap: Record<string, string> = {
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    available: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    fetching: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    running: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    summarizing: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    queued: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    missing: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  }

  const cls = colorMap[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

function relativeTime(date: Date): string {
  const now = Date.now()
  const diff = now - new Date(date).getTime()
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

  const minutes = Math.round(diff / 60000)
  const hours = Math.round(diff / 3600000)
  const days = Math.round(diff / 86400000)

  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute")
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour")
  return rtf.format(-days, "day")
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
                const error = f.transcriptError ?? f.processingError ?? null
                return (
                  <TableRow key={f.id}>
                    <TableCell className="max-w-[200px] truncate text-sm">{f.title}</TableCell>
                    <TableCell>
                      <StatusBadge status={f.transcriptStatus} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={f.summaryStatus} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {relativeTime(f.updatedAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {error ? error.slice(0, 80) : "—"}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
