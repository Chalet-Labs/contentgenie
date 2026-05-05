import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/observability/resolution-metrics", () => ({
  getMatchMethodHistogram: vi.fn(),
  getSimilarityHistogram: vi.fn(),
  getDisambigForcedCount: vi.fn(),
  getMatchMethodTrend: vi.fn(),
  getSimilarityTrend: vi.fn(),
  detectThresholdDrift: vi.fn(),
  windowFromKey: vi.fn(),
}));

vi.mock("@/lib/observability/reconciliation-audit", () => ({
  getReconciliationAuditLog: vi.fn(),
}));

vi.mock("@/lib/search-params/admin-topics-observability", () => ({
  loadAdminTopicsObservabilitySearchParams: vi.fn(),
  WINDOW_KEYS: ["24h", "7d", "30d"],
  GRANULARITY_KEYS: ["day", "week"],
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/entity-resolution-constants", () => ({
  MATCH_METHODS: ["auto", "llm_disambig", "new"],
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: React.AriaAttributes["aria-current"];
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

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
import { loadAdminTopicsObservabilitySearchParams } from "@/lib/search-params/admin-topics-observability";
import ObservabilityPage from "@/app/(app)/admin/topics/observability/page";

const mockGetMatchMethodHistogram = vi.mocked(getMatchMethodHistogram);
const mockGetSimilarityHistogram = vi.mocked(getSimilarityHistogram);
const mockGetDisambigForcedCount = vi.mocked(getDisambigForcedCount);
const mockGetMatchMethodTrend = vi.mocked(getMatchMethodTrend);
const mockGetSimilarityTrend = vi.mocked(getSimilarityTrend);
const mockDetectThresholdDrift = vi.mocked(detectThresholdDrift);
const mockGetReconciliationAuditLog = vi.mocked(getReconciliationAuditLog);
const mockWindowFromKey = vi.mocked(windowFromKey);
const mockLoader = vi.mocked(loadAdminTopicsObservabilitySearchParams);

const now = new Date("2026-04-30T12:00:00Z");
const start7d = new Date("2026-04-23T12:00:00Z");

function setupDefaultMocks() {
  mockLoader.mockResolvedValue({ window: "7d", granularity: "day" });
  mockWindowFromKey.mockReturnValue({ start: start7d, end: now });
  mockGetMatchMethodHistogram.mockResolvedValue({
    auto: 50,
    llm_disambig: 30,
    new: 20,
  });
  mockGetSimilarityHistogram.mockResolvedValue(
    Array.from({ length: 20 }, (_, i) => ({
      bucket: Math.round(i * 0.05 * 100) / 100,
      count: i * 3,
    })),
  );
  mockGetDisambigForcedCount.mockResolvedValue({
    versionTokenForced: 12,
    total: 100,
  });
  mockGetMatchMethodTrend.mockResolvedValue([]);
  mockGetSimilarityTrend.mockResolvedValue([]);
  mockDetectThresholdDrift.mockReturnValue({
    status: "ok",
    reason: "All metrics within healthy bounds",
    rates: { auto: 0.5, disambig: 0.3, new: 0.2, total: 100 },
  });
  mockGetReconciliationAuditLog.mockResolvedValue([]);
}

async function renderPage(
  searchParams: Record<string, string | string[] | undefined> = {
    window: "7d",
  },
) {
  const jsx = await ObservabilityPage({ searchParams });
  render(jsx as React.ReactElement);
}

describe("ObservabilityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders all three original card headings", async () => {
    await renderPage();
    expect(screen.getByText("Match method distribution")).toBeInTheDocument();
    expect(screen.getByText("Similarity histogram")).toBeInTheDocument();
    expect(
      screen.getByText("Version-token forced disambig"),
    ).toBeInTheDocument();
  });

  it("renders match-method counts correctly", async () => {
    await renderPage();
    expect(screen.getByText("50 (50%)")).toBeInTheDocument();
    expect(screen.getByText("30 (30%)")).toBeInTheDocument();
    expect(screen.getByText("20 (20%)")).toBeInTheDocument();
  });

  it("renders similarity buckets", async () => {
    await renderPage();
    const progressBars = document.querySelectorAll('[role="progressbar"]');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it("renders version-token-forced caption", async () => {
    await renderPage();
    const matches = screen.getAllByText(/12 of 100/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("active window link has aria-current='page'", async () => {
    mockLoader.mockResolvedValue({ window: "7d", granularity: "day" });
    await renderPage({ window: "7d" });
    const link = screen.getByRole("link", { name: "7 days" });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("inactive window links do not have aria-current", async () => {
    mockLoader.mockResolvedValue({ window: "7d", granularity: "day" });
    await renderPage({ window: "7d" });
    const inactiveLink = screen.getByRole("link", { name: "24 hours" });
    expect(inactiveLink).not.toHaveAttribute("aria-current");
  });

  it("renders safely when all metric data is zeroed (empty-state safety)", async () => {
    mockGetMatchMethodHistogram.mockResolvedValue({
      auto: 0,
      llm_disambig: 0,
      new: 0,
    });
    mockGetSimilarityHistogram.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        bucket: Math.round(i * 0.05 * 100) / 100,
        count: 0,
      })),
    );
    mockGetDisambigForcedCount.mockResolvedValue({
      versionTokenForced: 0,
      total: 0,
    });

    await expect(renderPage()).resolves.not.toThrow();
    expect(
      screen.getByText(/No resolutions in this window/),
    ).toBeInTheDocument();
  });

  // ─── New panels (T13) ─────────────────────────────────────────────────────────

  it("renders match method trend panel heading", async () => {
    await renderPage();
    expect(screen.getByText("Match method trend")).toBeInTheDocument();
  });

  it("renders similarity trend panel heading", async () => {
    await renderPage();
    expect(screen.getByText("Similarity trend")).toBeInTheDocument();
  });

  it("renders resolution drift panel heading", async () => {
    await renderPage();
    expect(screen.getByText("Resolution drift")).toBeInTheDocument();
  });

  it("renders reconciliation audit log panel heading", async () => {
    await renderPage();
    expect(screen.getByText("Reconciliation audit log")).toBeInTheDocument();
  });

  // ─── Granularity selector (QA ISSUE-001) ──────────────────────────────────────

  it("renders both granularity chips", async () => {
    await renderPage();
    expect(screen.getByRole("link", { name: "Day" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Week" })).toBeInTheDocument();
  });

  it("active granularity chip has aria-current='page'", async () => {
    mockLoader.mockResolvedValue({ window: "7d", granularity: "day" });
    await renderPage({ window: "7d" });
    const dayLink = screen.getByRole("link", { name: "Day" });
    expect(dayLink).toHaveAttribute("aria-current", "page");
  });

  it("inactive granularity chip does not have aria-current", async () => {
    mockLoader.mockResolvedValue({ window: "7d", granularity: "day" });
    await renderPage({ window: "7d" });
    const weekLink = screen.getByRole("link", { name: "Week" });
    expect(weekLink).not.toHaveAttribute("aria-current");
  });

  it("window links preserve granularity in href", async () => {
    mockLoader.mockResolvedValue({ window: "7d", granularity: "week" });
    await renderPage({ window: "7d", granularity: "week" });
    const link24h = screen.getByRole("link", { name: "24 hours" });
    expect(link24h).toHaveAttribute("href", "?window=24h&granularity=week");
  });

  it("granularity links preserve window in href", async () => {
    mockLoader.mockResolvedValue({ window: "30d", granularity: "day" });
    await renderPage({ window: "30d" });
    const weekLink = screen.getByRole("link", { name: "Week" });
    expect(weekLink).toHaveAttribute("href", "?window=30d&granularity=week");
  });
});
