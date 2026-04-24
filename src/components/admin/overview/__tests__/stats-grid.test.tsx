import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsGrid } from "@/components/admin/overview/stats-grid";
import type { OverviewStats } from "@/lib/admin/overview-queries";

const baseStats: OverviewStats = {
  totalPodcasts: 42,
  totalEpisodes: 1234,
  transcriptCoverage: 78,
  summaryCoverage: 55,
  processedToday: 12,
  queueDepthApprox: 7,
  activeFetchesApprox: 3,
};

describe("StatsGrid", () => {
  it("renders all stat values", () => {
    render(<StatsGrid stats={baseStats} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("1234")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("shows ~ prefix on approximate stats", () => {
    render(<StatsGrid stats={baseStats} />);
    // queue depth and active fetches are approximate
    const approximateValues = screen.getAllByText(/^~/);
    expect(approximateValues.length).toBeGreaterThanOrEqual(2);
  });

  it("shows trigger.dev link for approximate stats", () => {
    render(<StatsGrid stats={baseStats} />);
    const triggerLinks = screen.getAllByRole("link", { name: /trigger\.dev/i });
    expect(triggerLinks.length).toBeGreaterThanOrEqual(1);
  });
});
