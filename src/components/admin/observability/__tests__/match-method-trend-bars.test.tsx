import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchMethodTrendBars } from "@/components/admin/observability/match-method-trend-bars";
import type { MatchMethodTrendEntry } from "@/lib/observability/resolution-metrics";

function makeEntry(
  daysAgo: number,
  auto = 100,
  disambig = 20,
  newCount = 10,
): MatchMethodTrendEntry {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(0, 0, 0, 0);
  return {
    bucket: d,
    auto,
    llm_disambig: disambig,
    new: newCount,
    total: auto + disambig + newCount,
  };
}

describe("MatchMethodTrendBars", () => {
  it("renders one row per entry", () => {
    const entries = [makeEntry(2), makeEntry(1), makeEntry(0)];
    render(<MatchMethodTrendBars entries={entries} />);
    expect(screen.getAllByTestId("trend-row")).toHaveLength(3);
  });

  it("shows total count for each entry", () => {
    render(<MatchMethodTrendBars entries={[makeEntry(0, 100, 20, 10)]} />);
    // total = 130
    expect(screen.getByText("130")).toBeInTheDocument();
  });

  it("renders bar with aria-label describing counts", () => {
    render(<MatchMethodTrendBars entries={[makeEntry(0, 100, 20, 10)]} />);
    const bar = screen.getByLabelText(/auto: 100, llm_disambig: 20, new: 10/);
    expect(bar).toBeInTheDocument();
  });

  it("renders legend labels", () => {
    render(<MatchMethodTrendBars entries={[makeEntry(0)]} />);
    expect(screen.getByText("auto")).toBeInTheDocument();
    expect(screen.getByText("llm_disambig")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
  });

  it("shows empty state when entries is empty", () => {
    render(<MatchMethodTrendBars entries={[]} />);
    expect(screen.getByText("No trend data available.")).toBeInTheDocument();
  });

  it("handles all-zero total without crashing", () => {
    const entry: MatchMethodTrendEntry = {
      bucket: new Date(),
      auto: 0,
      llm_disambig: 0,
      new: 0,
      total: 0,
    };
    render(<MatchMethodTrendBars entries={[entry]} />);
    expect(screen.getAllByTestId("trend-row")).toHaveLength(1);
  });
});
