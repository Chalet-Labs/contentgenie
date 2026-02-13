import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PodcastCard } from "@/components/podcasts/podcast-card";
import type { PodcastIndexPodcast } from "@/lib/podcastindex";

const mockPodcast: PodcastIndexPodcast = {
  id: 123,
  podcastGuid: "guid-123",
  title: "Test Podcast",
  url: "https://example.com/feed",
  originalUrl: "https://example.com/feed",
  link: "https://example.com",
  description: "A great podcast about testing",
  author: "Test Author",
  ownerName: "Test Owner",
  image: "https://example.com/image.jpg",
  artwork: "https://example.com/artwork.jpg",
  lastUpdateTime: 1700000000,
  lastCrawlTime: 1700000000,
  lastParseTime: 1700000000,
  lastGoodHttpStatusTime: 1700000000,
  lastHttpStatus: 200,
  contentType: "application/xml",
  itunesId: null,
  itunesType: "episodic",
  generator: "Test",
  language: "en",
  explicit: false,
  type: 0,
  medium: "podcast",
  dead: 0,
  episodeCount: 42,
  crawlErrors: 0,
  parseErrors: 0,
  categories: { "1": "Technology", "2": "Science", "3": "Education", "4": "Health" },
  locked: 0,
  imageUrlHash: 0,
  newestItemPubdate: 1700000000,
};

describe("PodcastCard", () => {
  it("renders podcast title", () => {
    render(<PodcastCard podcast={mockPodcast} />);
    expect(screen.getByText("Test Podcast")).toBeInTheDocument();
  });

  it("renders author name", () => {
    render(<PodcastCard podcast={mockPodcast} />);
    expect(screen.getByText("Test Author")).toBeInTheDocument();
  });

  it("renders description (stripped of HTML)", () => {
    render(
      <PodcastCard
        podcast={{ ...mockPodcast, description: "<p>Cool <b>podcast</b></p>" }}
      />
    );
    expect(screen.getByText("Cool podcast")).toBeInTheDocument();
  });

  it("links to podcast detail page", () => {
    render(<PodcastCard podcast={mockPodcast} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/podcast/123?from=discover");
  });

  it("shows up to 3 categories", () => {
    render(<PodcastCard podcast={mockPodcast} />);
    expect(screen.getByText("Technology")).toBeInTheDocument();
    expect(screen.getByText("Science")).toBeInTheDocument();
    expect(screen.getByText("Education")).toBeInTheDocument();
    expect(screen.queryByText("Health")).not.toBeInTheDocument();
  });

  it("shows episode count", () => {
    render(<PodcastCard podcast={mockPodcast} />);
    expect(screen.getByText("42 episodes")).toBeInTheDocument();
  });

  it("handles missing author gracefully", () => {
    render(
      <PodcastCard
        podcast={{ ...mockPodcast, author: "", ownerName: "" }}
      />
    );
    expect(screen.getByText("Unknown author")).toBeInTheDocument();
  });
});
