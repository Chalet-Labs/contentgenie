export const dynamic = "force-dynamic";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  getMatchMethodHistogram,
  getSimilarityHistogram,
  getDisambigForcedCount,
  getMatchMethodTrend,
  getSimilarityTrend,
  detectThresholdDrift,
  windowFromKey,
} from "@/lib/observability/resolution-metrics";
import { getReconciliationAuditLog } from "@/lib/observability/reconciliation-audit";
import {
  WINDOW_KEYS,
  GRANULARITY_KEYS,
  loadAdminTopicsObservabilitySearchParams,
} from "@/lib/search-params/admin-topics-observability";
import { MATCH_METHODS } from "@/lib/entity-resolution-constants";
import { MatchMethodTrendBars } from "@/components/admin/observability/match-method-trend-bars";
import { SimilarityTrendHeatmap } from "@/components/admin/observability/similarity-trend-heatmap";
import { DriftBanner } from "@/components/admin/observability/drift-banner";
import { ReconciliationAuditTable } from "@/components/admin/observability/reconciliation-audit-table";

const WINDOW_LABELS: Record<(typeof WINDOW_KEYS)[number], string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
};

const GRANULARITY_LABELS: Record<(typeof GRANULARITY_KEYS)[number], string> = {
  day: "Day",
  week: "Week",
};

const MATCH_METHOD_META: Record<
  (typeof MATCH_METHODS)[number],
  { label: string }
> = {
  auto: { label: "Auto" },
  llm_disambig: { label: "LLM disambig" },
  new: { label: "New canonical" },
};

export default async function ObservabilityPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { window: windowKey, granularity } =
    await loadAdminTopicsObservabilitySearchParams(searchParams);
  const window = windowFromKey(windowKey);

  const [
    matchMethod,
    similarityBuckets,
    disambigForced,
    matchMethodTrend,
    similarityTrend,
    auditLog,
  ] = await Promise.all([
    getMatchMethodHistogram(window),
    getSimilarityHistogram(window),
    getDisambigForcedCount(window),
    getMatchMethodTrend(window, granularity),
    getSimilarityTrend(window, granularity),
    getReconciliationAuditLog(window),
  ]);

  // Drift derives from the same match-method histogram already fetched above —
  // pass it in instead of issuing a duplicate query.
  const driftResult = detectThresholdDrift(matchMethod);

  const matchMethodTotal = MATCH_METHODS.reduce(
    (sum, m) => sum + matchMethod[m],
    0,
  );

  const matchMethodRows = MATCH_METHODS.map((m) => ({
    key: m,
    label: MATCH_METHOD_META[m].label,
    count: matchMethod[m],
  }));

  const maxSimilarityCount = Math.max(
    ...similarityBuckets.map((b) => b.count),
    1,
  );

  const { versionTokenForced, total: forcedTotal } = disambigForced;

  return (
    <div className="space-y-6">
      <nav aria-label="Time window" className="flex gap-2">
        {WINDOW_KEYS.map((key) => (
          <Link
            key={key}
            href={`?window=${key}&granularity=${granularity}`}
            aria-current={windowKey === key ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              windowKey === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {WINDOW_LABELS[key]}
          </Link>
        ))}
      </nav>

      <nav aria-label="Granularity" className="flex gap-2">
        {GRANULARITY_KEYS.map((g) => (
          <Link
            key={g}
            href={`?window=${windowKey}&granularity=${g}`}
            aria-current={granularity === g ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              granularity === g
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {GRANULARITY_LABELS[g]}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
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
                    <Progress value={pct} max={100} className="h-3" />
                    <span className="text-xs text-muted-foreground">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

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

        <Card>
          <CardHeader>
            <CardTitle>Match method trend</CardTitle>
          </CardHeader>
          <CardContent>
            <MatchMethodTrendBars entries={matchMethodTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Similarity trend</CardTitle>
          </CardHeader>
          <CardContent>
            <SimilarityTrendHeatmap entries={similarityTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resolution drift</CardTitle>
          </CardHeader>
          <CardContent>
            <DriftBanner result={driftResult} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reconciliation audit log</CardTitle>
        </CardHeader>
        <CardContent>
          <ReconciliationAuditTable entries={auditLog} />
        </CardContent>
      </Card>
    </div>
  );
}
