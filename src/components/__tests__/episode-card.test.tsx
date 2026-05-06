import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EpisodeCard } from "@/components/podcasts/episode-card";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import type { CanonicalOverlapResult } from "@/lib/topic-overlap";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-label": ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-label"?: string;
  }) => (
    <a href={href} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/actions/listen-history", () => ({
  recordListenEvent: vi.fn().mockResolvedValue({ success: true }),
  getListenedEpisodeIds: vi.fn().mockResolvedValue(new Set()),
}));

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerAPI: () => ({
    playEpisode: vi.fn(),
    addToQueue: vi.fn(),
  }),
  useAudioPlayerState: () => ({ queue: [], currentEpisode: null }),
  useNowPlayingEpisodeId: () => null,
  useIsEpisodePlaying: (_id: string) => false,
  useIsEpisodeInQueue: (_id: string) => false,
}));

const mockEpisode: PodcastIndexEpisode = {
  id: 789,
  title: "Test Episode Title",
  link: "https://example.com/episode",
  description: "An episode about testing things",
  guid: "ep-guid-789",
  datePublished: 1705276800, // Jan 15, 2024
  datePublishedPretty: "January 15, 2024",
  dateCrawled: 1705276800,
  enclosureUrl: "https://example.com/audio.mp3",
  enclosureType: "audio/mpeg",
  enclosureLength: 10000000,
  duration: 1800, // 30 minutes
  explicit: 0,
  episode: 5,
  episodeType: "full",
  season: 2,
  image: "https://example.com/episode.jpg",
  feedItunesId: null,
  feedImage: "https://example.com/feed.jpg",
  feedId: 456,
  feedLanguage: "en",
  feedDead: 0,
  feedDuplicateOf: null,
  chaptersUrl: null,
  transcriptUrl: null,
  soundbite: null,
  soundbites: [],
  transcripts: [],
};

describe("EpisodeCard (podcasts wrapper)", () => {
  it("renders episode title", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(screen.getByText("Test Episode Title")).toBeInTheDocument();
  });

  it("renders episode description", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(
      screen.getByText("An episode about testing things"),
    ).toBeInTheDocument();
  });

  it("shows formatted duration", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(screen.getByText("30m")).toBeInTheDocument();
  });

  it("shows formatted publish date", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    const dateText = screen.getByText(/Jan.*15.*2024/);
    expect(dateText).toBeInTheDocument();
  });

  it("links to episode detail page", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/episode/789");
  });

  it("does not show episode type badge for 'full' episodes", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(screen.queryByText("full")).not.toBeInTheDocument();
  });

  it("shows episode type badge for non-full episodes", () => {
    render(
      <EpisodeCard episode={{ ...mockEpisode, episodeType: "trailer" }} />,
    );
    expect(screen.getByText("trailer")).toBeInTheDocument();
  });

  it("shows episode and season numbers", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(screen.getByText("Episode 5")).toBeInTheDocument();
    expect(screen.getByText("Season 2")).toBeInTheDocument();
  });

  it("handles missing description with fallback text", () => {
    render(<EpisodeCard episode={{ ...mockEpisode, description: "" }} />);
    expect(screen.getByText("No description available")).toBeInTheDocument();
  });

  it("renders score pill when worthItScore is provided", () => {
    render(
      <EpisodeCard
        episode={mockEpisode}
        summaryStatus="completed"
        worthItScore="8.50"
      />,
    );
    expect(screen.getByText(/8\.5/)).toBeInTheDocument();
  });

  it("does not render score pill without worthItScore", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(screen.queryByText(/^\d+\.\d$/)).not.toBeInTheDocument();
  });

  it("renders processing spinner for running status", () => {
    render(<EpisodeCard episode={mockEpisode} summaryStatus="running" />);
    expect(screen.getByLabelText("Processing")).toBeInTheDocument();
  });

  it("renders failed icon for failed status", () => {
    render(<EpisodeCard episode={mockEpisode} summaryStatus="failed" />);
    expect(screen.getByLabelText("Summary failed")).toBeInTheDocument();
  });

  it("renders no status icon for completed status", () => {
    render(
      <EpisodeCard
        episode={mockEpisode}
        summaryStatus="completed"
        worthItScore="7.0"
      />,
    );
    expect(screen.queryByLabelText("Processing")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Summary failed")).not.toBeInTheDocument();
  });

  it("renders unlistened button by default", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(
      screen.getByRole("button", { name: "Mark as listened" }),
    ).toBeInTheDocument();
  });

  it("renders listened indicator when isListened is true", () => {
    render(<EpisodeCard episode={mockEpisode} isListened={true} />);
    expect(
      screen.queryByRole("button", { name: "Mark as listened" }),
    ).toBeNull();
    expect(screen.getByLabelText("Already listened")).toBeInTheDocument();
  });

  it("forwards canonicalTopics to primitive — chip link is rendered", () => {
    render(
      <EpisodeCard
        episode={mockEpisode}
        canonicalTopics={[{ id: 7, label: "Creatine", kind: "concept" }]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /Topic: Creatine/i }),
    ).toBeInTheDocument();
  });

  it("renders no Topic: link when canonicalTopics is omitted", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(
      screen.queryByRole("link", { name: /Topic:/i }),
    ).not.toBeInTheDocument();
  });

  describe("overlap indicator", () => {
    const repeatOverlap: CanonicalOverlapResult = {
      kind: "repeat",
      count: 4,
      topicLabel: "sleep",
      topicId: 10,
    };
    const newOverlap: CanonicalOverlapResult = {
      kind: "new",
      topicLabel: "mitochondria",
      topicId: 11,
    };

    it("renders canonical repeat indicator when canonicalOverlap is set", () => {
      render(
        <EpisodeCard episode={mockEpisode} canonicalOverlap={repeatOverlap} />,
      );
      const indicator = screen.getByTestId("overlap-indicator");
      expect(indicator).toHaveTextContent("You've heard 4 episodes on sleep");
      expect(indicator).toHaveAttribute(
        "data-canonical-overlap-kind",
        "repeat",
      );
    });

    it("renders canonical new indicator when canonicalOverlap kind is new", () => {
      render(
        <EpisodeCard episode={mockEpisode} canonicalOverlap={newOverlap} />,
      );
      const indicator = screen.getByTestId("overlap-indicator");
      expect(indicator).toHaveTextContent("New: mitochondria");
      expect(indicator).toHaveAttribute("data-canonical-overlap-kind", "new");
    });

    it("renders no indicator when canonicalOverlap is null (no category data on this surface)", () => {
      render(<EpisodeCard episode={mockEpisode} canonicalOverlap={null} />);
      expect(screen.queryByTestId("overlap-indicator")).not.toBeInTheDocument();
    });
  });
});
