import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { StatsGrid } from "@/components/admin/overview/stats-grid"
import { TranscriptSourceCard } from "@/components/admin/overview/transcript-source-card"
import { RecentFailuresCard } from "@/components/admin/overview/recent-failures-card"
import { FailureTrendCard } from "@/components/admin/overview/failure-trend-card"
import {
  getOverviewStats,
  getTranscriptSourceBreakdown,
  getRecentFailures,
  getFailureTrend,
} from "@/lib/admin/overview-queries"

async function StatsSection() {
  const stats = await getOverviewStats()
  return <StatsGrid stats={stats} />
}

async function SourceSection() {
  const breakdown = await getTranscriptSourceBreakdown()
  return <TranscriptSourceCard breakdown={breakdown} />
}

async function FailuresSection() {
  const failures = await getRecentFailures()
  return <RecentFailuresCard failures={failures} />
}

async function TrendSection() {
  const trend = await getFailureTrend()
  return <FailureTrendCard trend={trend} />
}

export default function AdminOverviewPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <StatsSection />
      </Suspense>

      <div className="grid gap-6 md:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <SourceSection />
        </Suspense>

        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <TrendSection />
        </Suspense>
      </div>

      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <FailuresSection />
      </Suspense>
    </div>
  )
}
