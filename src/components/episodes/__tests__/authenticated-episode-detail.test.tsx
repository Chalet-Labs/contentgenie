import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedEpisodeDetail } from "@/components/episodes/authenticated-episode-detail";

const mocks = vi.hoisted(() => ({
  useAudioPlayerState: vi.fn(() => ({
    currentEpisode: null,
    isPlaying: false,
  })),
  useAudioPlayerProgress: vi.fn(() => ({ currentTime: 0, buffered: 0 })),
  useAudioPlayerAPI: vi.fn(() => ({
    togglePlay: vi.fn(),
    playEpisode: vi.fn(),
    seek: vi.fn(),
  })),
  useRealtimeRun: vi.fn(() => ({ run: null })),
  useOnlineStatus: vi.fn(() => true),
  isEpisodeSaved: vi.fn(),
  getEpisodeTopicOverlap: vi.fn(),
  cacheEpisode: vi.fn(),
  getCachedEpisode: vi.fn(),
}));

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: mocks.useAudioPlayerState,
  useAudioPlayerProgress: mocks.useAudioPlayerProgress,
  useAudioPlayerAPI: mocks.useAudioPlayerAPI,
}));

vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: mocks.useRealtimeRun,
}));

vi.mock("@/hooks/use-online-status", () => ({
  useOnlineStatus: mocks.useOnlineStatus,
}));

vi.mock("@/app/actions/library", () => ({
  isEpisodeSaved: mocks.isEpisodeSaved,
  revalidatePodcastPage: vi.fn(),
}));

vi.mock("@/app/actions/dashboard", () => ({
  getEpisodeTopicOverlap: mocks.getEpisodeTopicOverlap,
}));

vi.mock("@/lib/offline-cache", () => ({
  cacheEpisode: mocks.cacheEpisode,
  getCachedEpisode: mocks.getCachedEpisode,
}));

vi.mock("@/components/episodes/save-button", () => ({
  SaveButton: () => <div data-testid="save-button" />,
}));

vi.mock("@/components/audio-player/add-to-queue-button", () => ({
  AddToQueueButton: () => <div data-testid="queue-button" />,
}));

vi.mock("@/components/ui/share-button", () => ({
  ShareButton: () => <div data-testid="share-button" />,
}));

vi.mock("@/components/episodes/community-rating", () => ({
  CommunityRating: () => <div data-testid="community-rating" />,
}));

vi.mock("@/components/episodes/episode-transcript-fetch-button", () => ({
  EpisodeTranscriptFetchButton: () => (
    <div data-testid="transcript-fetch-button" />
  ),
}));

vi.mock("@/components/episodes/summary-display", () => ({
  SummaryDisplay: ({
    onGenerateSummary,
  }: {
    onGenerateSummary?: () => void;
  }) => (
    <div data-testid="summary-display">
      can-generate:{String(Boolean(onGenerateSummary))}
    </div>
  ),
}));

const CHAPTERS_URL = "https://example.com/chapters.json";

type EpisodeOverrides = {
  chaptersUrl?: string | null;
  description?: string;
  id?: string;
};

function makeEpisodeResponse(overrides: EpisodeOverrides = {}) {
  return {
    episode: {
      id: overrides.id ?? "rss-abc",
      title: "RSS Episode",
      description: overrides.description ?? "Episode description",
      datePublished: 1711929600,
      duration: 1800,
      enclosureUrl: "https://example.com/episode.mp3",
      episode: 10,
      episodeType: "full",
      season: 2,
      feedId: 456,
      feedImage: "https://example.com/feed.jpg",
      image: "https://example.com/episode.jpg",
      link: "https://publisher.example.com/rss-episode",
      chaptersUrl: overrides.chaptersUrl ?? null,
    },
    podcast: {
      id: "rss-podcast",
      title: "RSS Podcast",
      author: "Podcast Author",
      ownerName: "Podcast Author",
      image: "https://example.com/podcast.jpg",
      artwork: "https://example.com/podcast.jpg",
      categories: {
        1: "AI",
      },
    },
    summary: null,
    transcriptSource: null,
    transcriptStatus: null,
    episodeDbId: 12,
  };
}

function stubEpisodeFetch(overrides: EpisodeOverrides = {}) {
  const id = overrides.id ?? "rss-abc";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const parsed = new URL(rawUrl, "http://localhost");

      if (parsed.pathname === `/api/episodes/${id}`) {
        return Promise.resolve({
          ok: true,
          json: async () => makeEpisodeResponse(overrides),
        });
      }

      if (
        parsed.pathname === "/api/chapters" &&
        parsed.searchParams.get("url") === CHAPTERS_URL
      ) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            chapters: [
              { startTime: 0, title: "Cold open" },
              { startTime: 180, title: "Main segment" },
              { startTime: 900, title: "Q&A" },
            ],
          }),
        });
      }

      return Promise.reject(new Error(`Unexpected fetch call: ${rawUrl}`));
    }),
  );
}

describe("AuthenticatedEpisodeDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isEpisodeSaved.mockResolvedValue(false);
    mocks.getEpisodeTopicOverlap.mockResolvedValue({
      success: true,
      data: { label: null, labelKind: null },
    });
    mocks.getCachedEpisode.mockResolvedValue(undefined);
    stubEpisodeFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("handles getEpisodeTopicOverlap returning { success: false } gracefully", async () => {
    mocks.getEpisodeTopicOverlap.mockResolvedValue({
      success: false,
      error: "Unauthorized",
    });

    render(
      <AuthenticatedEpisodeDetail
        episodeId="rss-abc"
        userId="user-1"
        isAdmin={false}
      />,
    );

    await screen.findByRole("heading", { name: "RSS Episode" });
    await waitFor(() =>
      expect(mocks.getEpisodeTopicOverlap).toHaveBeenCalled(),
    );
    // Component renders without errors; overlap label stays absent
  });

  it("hides numeric-only processing actions for rss episodes", async () => {
    render(
      <AuthenticatedEpisodeDetail
        episodeId="rss-abc"
        userId="user-1"
        isAdmin={true}
      />,
    );

    await screen.findByRole("heading", { name: "RSS Episode" });

    expect(fetch).toHaveBeenCalledWith("/api/episodes/rss-abc");
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/episodes/summarize"),
    );

    await waitFor(() => {
      expect(screen.getByTestId("summary-display")).toHaveTextContent(
        "can-generate:false",
      );
    });

    expect(
      screen.queryByTestId("transcript-fetch-button"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /re-summarize/i }),
    ).not.toBeInTheDocument();
  });

  it("opens on the Insights tab and exposes About (Chapters hidden without a chaptersUrl)", async () => {
    render(
      <AuthenticatedEpisodeDetail
        episodeId="rss-abc"
        userId="user-1"
        isAdmin={false}
      />,
    );

    await screen.findByRole("heading", { name: "RSS Episode" });

    const insightsTab = await screen.findByRole("tab", { name: "Insights" });
    const aboutTab = screen.getByRole("tab", { name: "About" });

    expect(insightsTab).toHaveAttribute("data-state", "active");
    expect(aboutTab).toHaveAttribute("data-state", "inactive");
    expect(
      screen.queryByRole("tab", { name: /Chapters/i }),
    ).not.toBeInTheDocument();

    // Insights panel shows SummaryDisplay by default
    expect(screen.getByTestId("summary-display")).toBeInTheDocument();
  });

  it("shows the Chapters tab with its count and renders the list when clicked", async () => {
    stubEpisodeFetch({ chaptersUrl: CHAPTERS_URL });

    render(
      <AuthenticatedEpisodeDetail
        episodeId="rss-abc"
        userId="user-1"
        isAdmin={false}
      />,
    );

    const chaptersTab = await screen.findByRole("tab", { name: /Chapters/i });
    expect(chaptersTab).toBeInTheDocument();

    await waitFor(() => {
      expect(chaptersTab).toHaveTextContent("3");
    });

    const user = userEvent.setup();
    await user.click(chaptersTab);

    expect(chaptersTab).toHaveAttribute("data-state", "active");
    expect(await screen.findByText("Cold open")).toBeInTheDocument();
    expect(screen.getByText("Main segment")).toBeInTheDocument();
    expect(screen.getByText("Q&A")).toBeInTheDocument();
  });

  it("hides the About tab when the episode description is empty", async () => {
    stubEpisodeFetch({ description: "" });

    render(
      <AuthenticatedEpisodeDetail
        episodeId="rss-abc"
        userId="user-1"
        isAdmin={false}
      />,
    );

    await screen.findByRole("heading", { name: "RSS Episode" });

    expect(
      screen.queryByRole("tab", { name: "About" }),
    ).not.toBeInTheDocument();
  });

  it("switches to the About tab and renders the episode description", async () => {
    render(
      <AuthenticatedEpisodeDetail
        episodeId="rss-abc"
        userId="user-1"
        isAdmin={false}
      />,
    );

    const aboutTab = await screen.findByRole("tab", { name: "About" });

    const user = userEvent.setup();
    await user.click(aboutTab);

    expect(aboutTab).toHaveAttribute("data-state", "active");
    expect(
      screen.getByRole("heading", { name: "About This Episode" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Episode description")).toBeInTheDocument();
  });
});
