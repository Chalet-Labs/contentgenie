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

  it("renders error card when action returns error", async () => {
    mockGetTrendingTopicBySlug.mockResolvedValue({
      topic: null,
      allTopics: [],
      episodes: [],
      generatedAt: null,
      error: "Failed to load topic",
    });

    render(await TrendingDetailContent({ slug: "artificial-intelligence" }));

    expect(screen.getByRole("heading", { name: "Trending topics unavailable" })).toBeInTheDocument();
    expect(screen.getByText(/refresh the page or try again/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.queryByRole("heading", { name: "No trending topics right now" })).not.toBeInTheDocument();
  });

  it("renders empty-snapshot fallback when allTopics is empty", async () => {
    mockGetTrendingTopicBySlug.mockResolvedValue({
      topic: null,
      allTopics: [],
      episodes: [],
      generatedAt: null,
      error: null,
    });

    render(await TrendingDetailContent({ slug: "anything" }));

    expect(screen.getByRole("heading", { name: "No trending topics right now" })).toBeInTheDocument();
    expect(screen.getByText(/new trending topics are generated daily/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("renders unknown-slug fallback with switcher when snapshot has other topics", async () => {
    mockGetTrendingTopicBySlug.mockResolvedValue({
      topic: null,
      allTopics: [aiTopic, climateTopic],
      episodes: [],
      generatedAt: new Date(),
      error: null,
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

  it("renders happy path without stale notice for a fresh snapshot", async () => {
    const freshGeneratedAt = new Date(Date.now() - 60 * 60 * 1000);
    mockGetTrendingTopicBySlug.mockResolvedValue({
      topic: aiTopic,
      allTopics: [aiTopic, climateTopic],
      episodes: [mockEpisode],
      generatedAt: freshGeneratedAt,
      error: null,
    });

    render(await TrendingDetailContent({ slug: "artificial-intelligence" }));

    expect(screen.getByRole("heading", { level: 1, name: aiTopic.name })).toBeInTheDocument();
    expect(screen.queryByText(/may be out of date/i)).not.toBeInTheDocument();
    expect(screen.getByText(aiTopic.description)).toBeInTheDocument();
    expect(screen.getByText(/past 7 days/i)).toBeInTheDocument();
    expect(screen.getByText(mockEpisode.title)).toBeInTheDocument();
  });

  it("renders stale notice when snapshot is older than STALE_THRESHOLD_MS", async () => {
    const staleGeneratedAt = new Date(Date.now() - STALE_THRESHOLD_MS - 60_000);
    mockGetTrendingTopicBySlug.mockResolvedValue({
      topic: aiTopic,
      allTopics: [aiTopic],
      episodes: [mockEpisode],
      generatedAt: staleGeneratedAt,
      error: null,
    });

    render(await TrendingDetailContent({ slug: "artificial-intelligence" }));

    expect(screen.getByText(/these trending topics may be out of date/i)).toBeInTheDocument();
  });

  it("renders happy path with empty-episodes message when episodes is []", async () => {
    mockGetTrendingTopicBySlug.mockResolvedValue({
      topic: aiTopic,
      allTopics: [aiTopic],
      episodes: [],
      generatedAt: new Date(),
      error: null,
    });

    render(await TrendingDetailContent({ slug: "artificial-intelligence" }));

    expect(screen.getByText(/no episodes available for this topic yet/i)).toBeInTheDocument();
  });
});
