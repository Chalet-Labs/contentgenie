import { cn } from "@/lib/utils";
import { formatUtcShortDate } from "@/lib/admin/format-utils";
import type { SimilarityTrendEntry } from "@/lib/observability/resolution-metrics";

interface SimilarityTrendHeatmapProps {
  entries: SimilarityTrendEntry[];
}

const NUM_BUCKETS = 20;
const BUCKET_STEP = 0.05;
// X-axis tick positions: render labels only at the start, midpoint, and end of
// the bucket range so adjacent labels don't visually collide.
const TICK_INDICES: readonly number[] = [
  0,
  Math.floor(NUM_BUCKETS / 2),
  NUM_BUCKETS - 1,
];

type Quartile = 0 | 1 | 2 | 3 | 4;

function toQuartile(count: number, max: number): Quartile {
  if (count === 0 || max === 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

// bg-color alpha keeps all cells visible — even empty cells show a faint tint
// so the grid structure is legible in sparse matrices.
const BG_CLASS: Record<Quartile, string> = {
  0: "bg-indigo-600/10",
  1: "bg-indigo-600/30",
  2: "bg-indigo-600/55",
  3: "bg-indigo-600/80",
  4: "bg-indigo-600",
};

/** Ensure each entry carries exactly NUM_BUCKETS similarity buckets. */
function normalizeBuckets(entry: SimilarityTrendEntry): number[] {
  const map = new Map(
    entry.buckets.map((b) => [Math.round(b.bucket / BUCKET_STEP), b.count]),
  );
  return Array.from({ length: NUM_BUCKETS }, (_, i) => map.get(i) ?? 0);
}

export function SimilarityTrendHeatmap({
  entries,
}: SimilarityTrendHeatmapProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No trend data available.</p>
    );
  }

  // Pre-normalise all rows and compute global max once.
  const rows = entries.map((entry) => ({
    bucket: entry.bucket,
    counts: normalizeBuckets(entry),
  }));
  const globalMax = Math.max(1, ...rows.flatMap((r) => r.counts));

  const bucketLabels = Array.from({ length: NUM_BUCKETS }, (_, i) =>
    (i * BUCKET_STEP).toFixed(2),
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        {/* X-axis header */}
        <div className="flex items-center gap-px pb-1">
          <span className="w-16 shrink-0" />
          {bucketLabels.map((label, i) => (
            <span
              key={i}
              className="w-5 shrink-0 text-center text-[9px] leading-none text-muted-foreground"
            >
              {TICK_INDICES.includes(i) ? label : ""}
            </span>
          ))}
        </div>
        {/* Data rows */}
        {rows.map((row) => (
          <div
            key={row.bucket.toISOString()}
            className="flex items-center gap-px"
            data-testid="heatmap-row"
          >
            <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
              {formatUtcShortDate(row.bucket)}
            </span>
            {row.counts.map((count, colIdx) => {
              const q = toQuartile(count, globalMax);
              return (
                <div
                  key={colIdx}
                  role="img"
                  aria-label={`sim=${bucketLabels[colIdx]}: ${count}`}
                  className={cn("h-5 w-5 shrink-0 rounded-sm", BG_CLASS[q])}
                  data-testid={`heatmap-cell-${row.bucket.toISOString()}-${colIdx}`}
                  data-quartile={q}
                  title={`sim=${bucketLabels[colIdx]}: ${count}`}
                />
              );
            })}
          </div>
        ))}
        {/* X-axis label */}
        <div className="flex items-center gap-px pt-1">
          <span className="w-16 shrink-0 text-right text-[9px] text-muted-foreground">
            similarity →
          </span>
        </div>
      </div>
    </div>
  );
}
