import type { MatchMethodTrendEntry } from "@/lib/observability/resolution-metrics";
import { formatUtcShortDate } from "@/lib/admin/format-utils";

interface MatchMethodTrendBarsProps {
  entries: MatchMethodTrendEntry[];
}

export function MatchMethodTrendBars({ entries }: MatchMethodTrendBarsProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No trend data available.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 pb-1">
        <span className="w-16 shrink-0" />
        <div className="flex flex-1 gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-blue-500" />
            auto
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />
            llm_disambig
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
            new
          </span>
        </div>
      </div>
      {entries.map((entry) => {
        const total = entry.total > 0 ? entry.total : 1;
        const autoPct = (entry.auto / total) * 100;
        const disambPct = (entry.llm_disambig / total) * 100;
        const newPct = (entry.new / total) * 100;

        return (
          <div
            key={entry.bucket.toISOString()}
            className="flex items-center gap-3"
            data-testid="trend-row"
          >
            <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
              {formatUtcShortDate(entry.bucket)}
            </span>
            <div
              className="flex h-4 flex-1 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`auto: ${entry.auto}, llm_disambig: ${entry.llm_disambig}, new: ${entry.new}`}
            >
              <div
                className="h-full bg-blue-500"
                style={{ width: `${autoPct}%` }}
                aria-hidden="true"
              />
              <div
                className="h-full bg-amber-400"
                style={{ width: `${disambPct}%` }}
                aria-hidden="true"
              />
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${newPct}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {entry.total}
            </span>
          </div>
        );
      })}
    </div>
  );
}
