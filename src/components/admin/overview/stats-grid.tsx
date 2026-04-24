import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OverviewStats } from "@/lib/admin/overview-queries";

const TRIGGER_DASHBOARD_URL = "https://cloud.trigger.dev";

interface StatsGridProps {
  stats: OverviewStats;
}

function StatCard({
  title,
  value,
  description,
  approximate,
}: {
  title: string;
  value: string | number;
  description?: string;
  approximate?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {approximate ? "~" : ""}
          {value}
        </div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
        {approximate && (
          <p className="mt-1 text-xs text-muted-foreground">
            Approximate — based on episode status in DB.{" "}
            <a
              href={TRIGGER_DASHBOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              See Trigger.dev dashboard
            </a>{" "}
            for exact queue state.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Total Podcasts" value={stats.totalPodcasts} />
      <StatCard title="Total Episodes" value={stats.totalEpisodes} />
      <StatCard
        title="Transcript Coverage"
        value={`${stats.transcriptCoverage}%`}
        description="Episodes with available transcripts"
      />
      <StatCard
        title="Summary Coverage"
        value={`${stats.summaryCoverage}%`}
        description="Episodes with completed summaries"
      />
      <StatCard
        title="Processed Today"
        value={stats.processedToday}
        description="Summaries completed in last 24h"
      />
      <StatCard
        title="Queue Depth"
        value={stats.queueDepthApprox}
        approximate
      />
      <StatCard
        title="Active Fetches"
        value={stats.activeFetchesApprox}
        approximate
      />
    </div>
  );
}
