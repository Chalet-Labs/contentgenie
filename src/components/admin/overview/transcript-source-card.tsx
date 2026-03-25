import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { TranscriptSourceBreakdown } from "@/lib/admin/overview-queries"

interface TranscriptSourceCardProps {
  breakdown: TranscriptSourceBreakdown[]
}

export function TranscriptSourceCard({ breakdown }: TranscriptSourceCardProps) {
  const total = breakdown.reduce((sum, row) => sum + row.count, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transcript Sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {breakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transcript data available.</p>
        ) : (
          breakdown.map((row) => {
            const pct = total > 0 ? Math.round((row.count / total) * 100) : 0
            const label = row.source ?? "unknown"
            return (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="capitalize">{label}</span>
                  <span className="text-muted-foreground">
                    {row.count} ({pct}%)
                  </span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
