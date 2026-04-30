export const dynamic = "force-dynamic";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  getMatchMethodHistogram,
  getSimilarityHistogram,
  getDisambigForcedCount,
  windowFromKey,
} from "@/lib/observability/resolution-metrics";
import { loadAdminTopicsObservabilitySearchParams } from "@/lib/search-params/admin-topics-observability";

const WINDOWS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
] as const;

export default async function ObservabilityPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { window: windowKey } =
    await loadAdminTopicsObservabilitySearchParams(searchParams);
  const { start, end } = windowFromKey(windowKey);

  const [matchMethod, similarityBuckets, disambigForced] = await Promise.all([
    getMatchMethodHistogram({ start, end }),
    getSimilarityHistogram({ start, end }),
    getDisambigForcedCount({ start, end }),
  ]);

  const matchMethodTotal =
    matchMethod.auto + matchMethod.llm_disambig + matchMethod.new;

  const matchMethodRows = [
    { key: "auto", label: "Auto", count: matchMethod.auto },
    {
      key: "llm_disambig",
      label: "LLM disambig",
      count: matchMethod.llm_disambig,
    },
    { key: "new", label: "New canonical", count: matchMethod.new },
  ];

  const maxSimilarityCount = Math.max(
    ...similarityBuckets.map((b) => b.count),
    1,
  );

  const { versionTokenForced, total: forcedTotal } = disambigForced;

  return (
    <div className="space-y-6">
      {/* Time-window selector */}
      <nav className="flex gap-2">
        {WINDOWS.map(({ key, label }) => (
          <Link
            key={key}
            href={`?window=${key}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              windowKey === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* Card 1: Match-method distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Match method distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {matchMethodRows.map(({ key, label, count }) => {
              const pct =
                matchMethodTotal > 0
                  ? Math.round((count / matchMethodTotal) * 100)
                  : 0;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{label}</span>
                    <span className="text-muted-foreground">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <Progress value={pct} max={100} />
                </div>
              );
            })}
            {matchMethodTotal === 0 && (
              <p className="text-sm text-muted-foreground">
                No resolutions in this window.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Similarity histogram */}
        <Card>
          <CardHeader>
            <CardTitle>Similarity histogram</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {similarityBuckets.map(({ bucket, count }) => {
                const pct =
                  maxSimilarityCount > 0
                    ? Math.round((count / maxSimilarityCount) * 100)
                    : 0;
                return (
                  <div key={bucket} className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                      {bucket.toFixed(2)}
                    </span>
                    <div
                      className="h-3 bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Version-token forced disambig count */}
        <Card>
          <CardHeader>
            <CardTitle>Version-token forced disambig</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Forced</span>
                <span className="text-muted-foreground">
                  {versionTokenForced} of {forcedTotal} resolutions
                </span>
              </div>
              <Progress value={versionTokenForced} max={forcedTotal || 1} />
            </div>
            <p className="text-xs text-muted-foreground">
              {versionTokenForced} of {forcedTotal} resolutions forced
              disambiguation via the version-token gate.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
