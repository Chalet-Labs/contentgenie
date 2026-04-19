import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PublicEpisodeDetail } from "@/components/episodes/public-episode-detail";

const mockIsEpisodeSaved = vi.fn();
const mockGetEpisodeTopicOverlap = vi.fn();
const mockGetEpisodeAverageRating = vi.fn();

vi.mock("@/app/actions/library", () => ({
  isEpisodeSaved: (...args: unknown[]) => mockIsEpisodeSaved(...args),
  getEpisodeAverageRating: (...args: unknown[]) =>
    mockGetEpisodeAverageRating(...args),
}));

vi.mock("@/app/actions/dashboard", () => ({
  getEpisodeTopicOverlap: (...args: unknown[]) =>
    mockGetEpisodeTopicOverlap(...args),
}));

vi.mock("@/hooks/use-online-status", () => ({
  useOnlineStatus: () => true,
}));

describe("PublicEpisodeDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEpisodeAverageRating.mockResolvedValue({
      averageRating: 4.5,
      ratingCount: 12,
      error: null,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input === "/api/episodes/123") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              episode: {
                id: 123,
                title: "Public Episode",
                description: "Episode description",
                datePublished: 1711929600,
                duration: 1800,
                enclosureUrl: "https://example.com/public-episode.mp3",
                episode: 10,
                episodeType: "full",
                season: 2,
                feedId: 456,
                feedImage: "https://example.com/feed.jpg",
                image: "https://example.com/episode.jpg",
                link: "https://publisher.example.com/public-episode",
              },
              podcast: {
                id: 456,
                title: "Public Podcast",
                author: "Podcast Author",
                ownerName: "Podcast Author",
                image: "https://example.com/podcast.jpg",
                artwork: "https://example.com/podcast.jpg",
                categories: {
                  1: "AI",
                  2: "Leadership",
                },
              },
              summary: {
                summary: "AI summary",
                keyTakeaways: ["One", "Two"],
                worthItScore: 8.2,
                worthItReason: "Worth your time",
                worthItDimensions: null,
              },
              transcriptSource: null,
              transcriptStatus: null,
              episodeDbId: null,
            }),
          });
        }

        return Promise.reject(new Error(`Unexpected fetch call: ${input}`));
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the public CTA, standalone audio player, and sign-up redirects without authenticated lookups", async () => {
    const { container } = render(<PublicEpisodeDetail episodeId="123" />);

    await screen.findByRole("heading", { name: "Public Episode" });

    expect(
      screen.getByText(/sign up to save episodes and discover more/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /sign up/i })
    ).toHaveAttribute(
      "href",
      "/sign-up?redirect_url=%2Fepisode%2F123"
    );

    expect(
      screen.getByRole("link", { name: "Public Podcast" })
    ).toHaveAttribute("href", "/sign-up?redirect_url=%2Fpodcast%2F456");

    const audio = container.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio).toHaveAttribute(
      "src",
      "https://example.com/public-episode.mp3"
    );

    await waitFor(() => {
      expect(mockIsEpisodeSaved).not.toHaveBeenCalled();
      expect(mockGetEpisodeTopicOverlap).not.toHaveBeenCalled();
    });

    expect(fetch).toHaveBeenCalledWith("/api/episodes/123");
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/episodes/summarize")
    );
  });

  it("shows a public summary placeholder when no summary is available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          episode: {
            id: 123,
            title: "Public Episode",
            description: "Episode description",
            datePublished: 1711929600,
            duration: 1800,
            enclosureUrl: "https://example.com/public-episode.mp3",
            episode: 10,
            episodeType: "full",
            season: 2,
            feedId: 456,
            feedImage: "https://example.com/feed.jpg",
            image: "https://example.com/episode.jpg",
            link: "https://publisher.example.com/public-episode",
          },
          podcast: null,
          summary: null,
          transcriptSource: null,
          transcriptStatus: null,
          episodeDbId: null,
        }),
      })
    );

    render(<PublicEpisodeDetail episodeId="123" />);

    await screen.findByRole("heading", { name: "Public Episode" });
    expect(
      screen.getByText(/summary not yet available/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sign up to request one/i)
    ).toBeInTheDocument();
  });

  it("ignores stale fetch responses after episodeId changes", async () => {
    type MockEpisodeResponse = {
      ok: boolean;
      json: () => Promise<unknown>;
    };

    let resolveFirstRequest: ((value: MockEpisodeResponse) => void) | null =
      null;
    const secondResponse = {
      ok: true,
      json: async () => ({
        episode: {
          id: 456,
          title: "Second Episode",
          description: "Episode description",
          datePublished: 1711929600,
          duration: 1800,
          enclosureUrl: "https://example.com/second-episode.mp3",
          episode: 11,
          episodeType: "full",
          season: 2,
          feedId: 456,
          feedImage: "https://example.com/feed.jpg",
          image: "https://example.com/episode.jpg",
          link: "https://publisher.example.com/second-episode",
        },
        podcast: null,
        summary: null,
        transcriptSource: null,
        transcriptStatus: null,
        episodeDbId: null,
      }),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string) => {
        if (input === "/api/episodes/123") {
          return new Promise((resolve) => {
            resolveFirstRequest = resolve;
          });
        }

        if (input === "/api/episodes/456") {
          return Promise.resolve(secondResponse);
        }

        return Promise.reject(new Error(`Unexpected fetch call: ${input}`));
      })
    );

    const { rerender } = render(<PublicEpisodeDetail episodeId="123" />);
    rerender(<PublicEpisodeDetail episodeId="456" />);

    await screen.findByRole("heading", { name: "Second Episode" });

    expect(resolveFirstRequest).not.toBeNull();

    resolveFirstRequest!({
      ok: true,
      json: async () => ({
        episode: {
          id: 123,
          title: "First Episode",
          description: "Episode description",
          datePublished: 1711929600,
          duration: 1800,
          enclosureUrl: "https://example.com/first-episode.mp3",
          episode: 10,
          episodeType: "full",
          season: 2,
          feedId: 456,
          feedImage: "https://example.com/feed.jpg",
          image: "https://example.com/episode.jpg",
          link: "https://publisher.example.com/first-episode",
        },
        podcast: null,
        summary: null,
        transcriptSource: null,
        transcriptStatus: null,
        episodeDbId: null,
      }),
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Second Episode" })
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("heading", { name: "First Episode" })
    ).not.toBeInTheDocument();
  });
});
