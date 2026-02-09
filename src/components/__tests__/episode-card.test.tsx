import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EpisodeCard } from "@/components/podcasts/episode-card";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";

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

describe("EpisodeCard", () => {
  it("renders episode title", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(screen.getByText("Test Episode Title")).toBeInTheDocument();
  });

  it("renders episode description", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(
      screen.getByText("An episode about testing things")
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
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/episode/789");
  });

  it("does not show episode type badge for 'full' episodes", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(screen.queryByText("full")).not.toBeInTheDocument();
  });

  it("shows episode type badge for non-full episodes", () => {
    render(
      <EpisodeCard
        episode={{ ...mockEpisode, episodeType: "trailer" }}
      />
    );
    expect(screen.getByText("trailer")).toBeInTheDocument();
  });

  it("shows episode and season numbers", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(screen.getByText("Episode 5")).toBeInTheDocument();
    expect(screen.getByText("Season 2")).toBeInTheDocument();
  });

  it("handles missing description", () => {
    render(
      <EpisodeCard episode={{ ...mockEpisode, description: "" }} />
    );
    expect(
      screen.getByText("No description available")
    ).toBeInTheDocument();
  });

  it("shows left border accent when summaryStatus is completed", () => {
    const { container } = render(
      <EpisodeCard episode={mockEpisode} summaryStatus="completed" />
    );
    const card = container.querySelector("[class*='border-l-2']");
    expect(card).toBeInTheDocument();
    expect(card).toHaveClass("border-primary");
  });

  it("does not show left border accent without summaryStatus", () => {
    const { container } = render(
      <EpisodeCard episode={mockEpisode} />
    );
    const card = container.querySelector("[class*='border-l-2']");
    expect(card).not.toBeInTheDocument();
  });

  it("renders high score in green", () => {
    render(
      <EpisodeCard episode={mockEpisode} summaryStatus="completed" worthItScore="8.50" />
    );
    expect(screen.getByText("8.5")).toBeInTheDocument();
    const scoreContainer = screen.getByText("8.5").closest("div");
    expect(scoreContainer).toHaveClass("text-green-600");
  });

  it("renders medium score in amber", () => {
    render(
      <EpisodeCard episode={mockEpisode} summaryStatus="completed" worthItScore="6.00" />
    );
    expect(screen.getByText("6.0")).toBeInTheDocument();
    const scoreContainer = screen.getByText("6.0").closest("div");
    expect(scoreContainer).toHaveClass("text-amber-600");
  });

  it("renders low score in red", () => {
    render(
      <EpisodeCard episode={mockEpisode} summaryStatus="completed" worthItScore="3.50" />
    );
    expect(screen.getByText("3.5")).toBeInTheDocument();
    const scoreContainer = screen.getByText("3.5").closest("div");
    expect(scoreContainer).toHaveClass("text-red-600");
  });

  it("does not render score indicator without worthItScore", () => {
    render(<EpisodeCard episode={mockEpisode} />);
    expect(screen.queryByText(/^\d+\.\d$/)).not.toBeInTheDocument();
  });
});
