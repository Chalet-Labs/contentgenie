import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EpisodeList } from "@/components/podcasts/episode-list";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";

vi.mock("@/components/podcasts/episode-card", () => ({
  EpisodeCard: ({
    episode,
    summaryStatus,
    worthItScore,
  }: {
    episode: { id: string | number; title: string };
    summaryStatus?: string;
    worthItScore?: string;
  }) => (
    <div
      data-testid="episode-card"
      data-status={summaryStatus ?? ""}
      data-score={worthItScore ?? ""}
    >
      {episode.title}
    </div>
  ),
}));

function makeEpisode(id: number, title: string): PodcastIndexEpisode {
  return {
    id,
    title,
    link: "",
    description: "",
    guid: String(id),
    datePublished: 0,
    datePublishedPretty: "",
    dateCrawled: 0,
    enclosureUrl: "",
    enclosureType: "audio/mpeg",
    enclosureLength: 0,
    duration: 0,
    explicit: 0,
    episode: null,
    episodeType: "full",
    season: 0,
    image: "",
    feedItunesId: null,
    feedImage: "",
    feedId: 0,
    feedLanguage: "",
    feedDead: 0,
    feedDuplicateOf: null,
    chaptersUrl: null,
    transcriptUrl: null,
    soundbite: null,
    soundbites: [],
    transcripts: [],
  };
}

const fixtures: PodcastIndexEpisode[] = [
  makeEpisode(1, "Intro to TypeScript"),
  makeEpisode(2, "Advanced React Patterns"),
  makeEpisode(3, "Rust for JS devs"),
];

describe("EpisodeList", () => {
  it("renders all episodes when query is empty", () => {
    render(<EpisodeList episodes={fixtures} />);
    expect(screen.getAllByTestId("episode-card")).toHaveLength(fixtures.length);
  });

  it("filters episodes case-insensitively by title substring", () => {
    render(<EpisodeList episodes={fixtures} />);
    const input = screen.getByLabelText(/search episodes by title/i);
    fireEvent.change(input, { target: { value: "rust" } });
    const cards = screen.getAllByTestId("episode-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Rust for JS devs");
  });

  it("matches mixed-case queries", () => {
    render(<EpisodeList episodes={fixtures} />);
    const input = screen.getByLabelText(/search episodes by title/i);
    fireEvent.change(input, { target: { value: "RuSt" } });
    expect(screen.getAllByTestId("episode-card")).toHaveLength(1);
  });

  it("shows no-match empty state when query matches nothing", () => {
    render(<EpisodeList episodes={fixtures} />);
    const input = screen.getByLabelText(/search episodes by title/i);
    fireEvent.change(input, { target: { value: "xyz-no-match" } });
    expect(screen.queryByTestId("episode-card")).not.toBeInTheDocument();
    expect(
      screen.getByText(/no episodes match "xyz-no-match"/i),
    ).toBeInTheDocument();
  });

  it("restores the full list when the query is cleared", () => {
    render(<EpisodeList episodes={fixtures} />);
    const input = screen.getByLabelText(/search episodes by title/i);
    fireEvent.change(input, { target: { value: "rust" } });
    expect(screen.getAllByTestId("episode-card")).toHaveLength(1);
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getAllByTestId("episode-card")).toHaveLength(fixtures.length);
  });

  it("treats whitespace-only queries as empty", () => {
    render(<EpisodeList episodes={fixtures} />);
    const input = screen.getByLabelText(/search episodes by title/i);
    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getAllByTestId("episode-card")).toHaveLength(fixtures.length);
  });

  it("hides the search input and shows the source-empty state when episodes is empty", () => {
    render(<EpisodeList episodes={[]} />);
    expect(
      screen.queryByLabelText(/search episodes by title/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/no episodes found for this podcast/i),
    ).toBeInTheDocument();
  });

  it("hides the search input while loading", () => {
    render(<EpisodeList episodes={fixtures} isLoading />);
    expect(
      screen.queryByLabelText(/search episodes by title/i),
    ).not.toBeInTheDocument();
  });

  it("hides the search input when an error is set", () => {
    render(<EpisodeList episodes={fixtures} error="Could not load" />);
    expect(
      screen.queryByLabelText(/search episodes by title/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Could not load")).toBeInTheDocument();
  });

  it("forwards statusMap and scoreMap to filtered episodes", () => {
    const statusMap = { "3": "completed" as const };
    const scoreMap = { "3": "0.85" };
    render(
      <EpisodeList episodes={fixtures} statusMap={statusMap} scoreMap={scoreMap} />,
    );
    const input = screen.getByLabelText(/search episodes by title/i);
    fireEvent.change(input, { target: { value: "rust" } });
    const card = screen.getByTestId("episode-card");
    expect(card).toHaveAttribute("data-status", "completed");
    expect(card).toHaveAttribute("data-score", "0.85");
  });

  it("does not throw when an episode title is missing or null", () => {
    const withMissingTitle = [
      ...fixtures,
      { ...makeEpisode(99, ""), title: undefined as unknown as string },
      { ...makeEpisode(100, ""), title: null as unknown as string },
    ];
    render(<EpisodeList episodes={withMissingTitle} />);
    const input = screen.getByLabelText(/search episodes by title/i);
    expect(() =>
      fireEvent.change(input, { target: { value: "rust" } }),
    ).not.toThrow();
    expect(screen.getAllByTestId("episode-card")).toHaveLength(1);
  });
});
