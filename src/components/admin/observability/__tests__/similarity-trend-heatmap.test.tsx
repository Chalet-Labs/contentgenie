import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SimilarityTrendHeatmap } from "@/components/admin/observability/similarity-trend-heatmap";
import {
  SIMILARITY_BUCKET_SIZE,
  type SimilarityTrendEntry,
  type SimilarityBucket,
} from "@/lib/observability/similarity-buckets";

const NUM_BUCKETS = Math.ceil(1 / SIMILARITY_BUCKET_SIZE);

function makeDay(
  daysAgo: number,
  countFn: (i: number) => number = () => 0,
): SimilarityTrendEntry {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(0, 0, 0, 0);
  const buckets: SimilarityBucket[] = Array.from(
    { length: NUM_BUCKETS },
    (_, i) => ({
      bucket: Math.round(i * SIMILARITY_BUCKET_SIZE * 1e10) / 1e10,
      count: countFn(i),
    }),
  );
  return { bucket: d, buckets };
}

describe("SimilarityTrendHeatmap", () => {
  it("renders one row per entry", () => {
    const entries = [makeDay(2), makeDay(1), makeDay(0)];
    render(<SimilarityTrendHeatmap entries={entries} />);
    expect(screen.getAllByTestId("heatmap-row")).toHaveLength(3);
  });

  it("renders one cell per similarity bucket", () => {
    render(<SimilarityTrendHeatmap entries={[makeDay(0)]} />);
    // Each cell gets data-testid="heatmap-cell-{isoDate}-{colIdx}"
    const row = screen.getByTestId("heatmap-row");
    const cells = row.querySelectorAll("[data-quartile]");
    expect(cells).toHaveLength(NUM_BUCKETS);
  });

  it("assigns quartile=0 to empty cells", () => {
    render(<SimilarityTrendHeatmap entries={[makeDay(0, () => 0)]} />);
    const cells = screen
      .getByTestId("heatmap-row")
      .querySelectorAll("[data-quartile]");
    cells.forEach((cell) => {
      expect(cell.getAttribute("data-quartile")).toBe("0");
    });
  });

  it("assigns quartile=4 to the max-count cell", () => {
    // Pick a non-edge bucket near the high-similarity end so the test exercises
    // an interior cell while staying robust to bucket-grid retuning.
    const targetIdx = NUM_BUCKETS - 2;
    const entries = [makeDay(0, (i) => (i === targetIdx ? 100 : 0))];
    render(<SimilarityTrendHeatmap entries={entries} />);
    const cells = screen
      .getByTestId("heatmap-row")
      .querySelectorAll("[data-quartile]");
    expect(cells[targetIdx]?.getAttribute("data-quartile")).toBe("4");
    expect(cells[0]?.getAttribute("data-quartile")).toBe("0");
  });

  it("applies bg-indigo-600 (full opacity) class to quartile-4 cell", () => {
    const targetIdx = NUM_BUCKETS - 1;
    const entries = [makeDay(0, (i) => (i === targetIdx ? 50 : 0))];
    render(<SimilarityTrendHeatmap entries={entries} />);
    const maxCell = screen
      .getByTestId("heatmap-row")
      .querySelectorAll("[data-quartile='4']")[0];
    // Full-opacity class — matches bg-indigo-600 but not bg-indigo-600/xx
    expect(maxCell?.className).toMatch(/bg-indigo-600(?!\/)/);
  });

  it("applies bg-indigo-600/10 (faint tint) class to zero-count cells", () => {
    render(<SimilarityTrendHeatmap entries={[makeDay(0, () => 0)]} />);
    const zeroCell = screen
      .getByTestId("heatmap-row")
      .querySelectorAll("[data-quartile='0']")[0];
    // Faint tint — still visible, not opacity-0
    expect(zeroCell?.className).toMatch(/bg-indigo-600\/10/);
  });

  it("computes quartiles across the full matrix (multi-row)", () => {
    // Row 0 col 0 = 100 (max), Row 1 col 0 = 25 (=25% → Q1 boundary)
    const entries = [
      makeDay(1, (i) => (i === 0 ? 100 : 0)),
      makeDay(0, (i) => (i === 0 ? 25 : 0)),
    ];
    render(<SimilarityTrendHeatmap entries={entries} />);
    const rows = screen.getAllByTestId("heatmap-row");
    const row0col0 = rows[0]!.querySelectorAll("[data-quartile]")[0];
    const row1col0 = rows[1]!.querySelectorAll("[data-quartile]")[0];
    // 100/100 = 1.0 → Q4
    expect(row0col0?.getAttribute("data-quartile")).toBe("4");
    // 25/100 = 0.25 → Q1 (≤0.25)
    expect(row1col0?.getAttribute("data-quartile")).toBe("1");
  });

  it("shows empty state when entries is empty", () => {
    render(<SimilarityTrendHeatmap entries={[]} />);
    expect(screen.getByText("No trend data available.")).toBeInTheDocument();
  });
});
