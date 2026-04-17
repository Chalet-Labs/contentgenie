import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TrendingTopic } from "@/db/schema";
import type { RecommendedEpisodeDTO } from "@/db/library-columns";

const mockGetTrendingTopicBySlug = vi.fn();
vi.mock("@/app/actions/dashboard", () => ({
  getTrendingTopicBySlug: (slug: string) => mockGetTrendingTopicBySlug(slug),
}));

import { TrendingDetailContent } from "../trending-detail-content";
import { STALE_THRESHOLD_MS } from "@/lib/trending";

const aiTopic: TrendingTopic = {
  name: "Artificial Intelligence",
  description: "AI trends",
  episodeCount: 3,
  episodeIds: [10, 20, 30],
  slug: "artificial-intelligence",
};

const climateTopic: TrendingTopic = {
  name: "Climate Policy",
  description: "Climate news",
  episodeCount: 2,
  episodeIds: [40, 50],
  slug: "climate-policy",
};

const mockEpisode: RecommendedEpisodeDTO = {
  id: 10,
  podcastIndexId: "pod-10",
  title: "AI Episode",
  description: "About AI",
  audioUrl: "https://example.com/ai.mp3",
  duration: 3600,
  publishDate: new Date("2026-04-01T00:00:00Z"),
  worthItScore: "8.50",
  podcastTitle: "AI Podcast",
  podcastImageUrl: "https://example.com/ai.jpg",
  bestTopicRank: null,
  topRankedTopic: null,
};

describe("TrendingDetailContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders error card when action returns kind=error", async () => {
    mockGetTrendingTopicBySlug.mockResolvedValue({ kind: "error", message: "Failed to load topic" });

    render(await TrendingDetailContent({ slug: "artificial-intelligence" }));

    expect(screen.getByRole("heading", { name: "Trending topics unavailable" })).toBeInTheDocument();
    expect(screen.getByText(/refresh the page or try again/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.queryByRole("heading", { name: "No trending topics right now" })).not.toBeInTheDocument();
  });

  it("renders no-snapshot fallback without a switcher", async () => {
    mockGetTrendingTopicBySlug.mockResolvedValue({ kind: "no-snapshot" });

    render(await TrendingDetailContent({ slug: "anything" }));

    expect(screen.getByRole("heading", { name: "No trending topics right now" })).toBeInTheDocument();
    expect(screen.getByText(/new trending topics are generated daily/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.queryByRole("navigation", { name: "Trending topics" })).not.toBeInTheDocument();
  });

  it("renders unknown-slug fallback with switcher", async () => {
    mockGetTrendingTopicBySlug.mockResolvedValue({
      kind: "unknown-slug",
      allTopics: [aiTopic, climateTopic],
      generatedAt: new Date(),
    });

    render(await TrendingDetailContent({ slug: "unknown-slug" }));

    expect(
      screen.getByRole("heading", { name: "This topic is no longer trending" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/didn't make the latest trending snapshot/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Artificial Intelligence" })).toHaveAttribute(
      "href",
      "/trending/artificial-intelligence",
    );
    expect(screen.getByRole("link", { name: "Climate Policy" })).toHaveAttribute(
      "href",
      "/trending/climate-policy",
    );
  });

  it("renders found happy path without stale notice for a fresh snapshot", async () => {
    const freshGeneratedAt = new Date(Date.now() - 60 * 60 * 1000);
    mockGetTrendingTopicBySlug.mockResolvedValue({
      kind: "found",
      topic: aiTopic,
      allTopics: [aiTopic, climateTopic],
      episodes: [mockEpisode],
      generatedAt: freshGeneratedAt,
    });

    render(await TrendingDetailContent({ slug: "artificial-intelligence" }));

    expect(screen.getByRole("heading", { level: 1, name: aiTopic.name })).toBeInTheDocument();
    expect(screen.queryByText(/may be out of date/i)).not.toBeInTheDocument();
    expect(screen.getByText(aiTopic.description)).toBeInTheDocument();
    expect(screen.getByText(/past 7 days/i)).toBeInTheDocument();
    expect(screen.getByText(mockEpisode.title)).toBeInTheDocument();
  });

  it("renders found + stale notice when snapshot is older than STALE_THRESHOLD_MS", async () => {
    const staleGeneratedAt = new Date(Date.now() - STALE_THRESHOLD_MS - 60_000);
    mockGetTrendingTopicBySlug.mockResolvedValue({
      kind: "found",
      topic: aiTopic,
      allTopics: [aiTopic],
      episodes: [mockEpisode],
      generatedAt: staleGeneratedAt,
    });

    render(await TrendingDetailContent({ slug: "artificial-intelligence" }));

    expect(screen.getByText(/this trending topic may be out of date/i)).toBeInTheDocument();
  });

  it("renders found + empty-episodes message when episodes is []", async () => {
    mockGetTrendingTopicBySlug.mockResolvedValue({
      kind: "found",
      topic: aiTopic,
      allTopics: [aiTopic],
      episodes: [],
      generatedAt: new Date(),
    });

    render(await TrendingDetailContent({ slug: "artificial-intelligence" }));

    expect(screen.getByText(/no episodes available for this topic yet/i)).toBeInTheDocument();
  });
});
