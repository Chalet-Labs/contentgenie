import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  EpisodeRecommendations,
  EpisodeRecommendationsLoading,
  EPISODES_INITIAL,
} from "@/components/dashboard/episode-recommendations";
import type { RecommendedEpisodeDTO } from "@/db/library-columns";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _idCounter = 1;

beforeEach(() => {
  _idCounter = 1;
});

function makeEpisode(
  overrides: Partial<RecommendedEpisodeDTO> = {},
): RecommendedEpisodeDTO {
  const id = _idCounter++;
  return {
    id,
    podcastIndexId: String(id * 100),
    title: `Episode ${id}`,
    description: null,
    audioUrl: null,
    duration: null,
    publishDate: null,
    worthItScore: null,
    podcastTitle: `Podcast ${id}`,
    podcastImageUrl: null,
    bestTopicRank: null,
    topRankedTopic: null,
    overlapCount: undefined,
    overlapTopic: null,
    overlapLabel: null,
    overlapLabelKind: null,
    ...overrides,
  };
}

function makeEpisodes(count: number): RecommendedEpisodeDTO[] {
  return Array.from({ length: count }, () => makeEpisode());
}

// ---------------------------------------------------------------------------
// EpisodeRecommendations — toggle behaviour
// ---------------------------------------------------------------------------

describe("EpisodeRecommendations", () => {
  it("renders only EPISODES_INITIAL episodes when more than EPISODES_INITIAL are provided and not expanded", () => {
    const episodes = makeEpisodes(EPISODES_INITIAL + 2);
    render(<EpisodeRecommendations episodes={episodes} />);
    const links = screen.getAllByRole("link", { name: /Episode/ });
    expect(links).toHaveLength(EPISODES_INITIAL);
  });

  it("shows all episodes after clicking the expand button", async () => {
    const total = EPISODES_INITIAL + 3;
    const episodes = makeEpisodes(total);
    render(<EpisodeRecommendations episodes={episodes} />);

    const user = userEvent.setup();
    const toggleBtn = screen.getByRole("button", { name: /show.*more/i });
    await user.click(toggleBtn);

    const links = screen.getAllByRole("link", { name: /Episode/ });
    expect(links).toHaveLength(total);
  });

  it("shows 'Show less' button after expanding and re-collapses when clicked", async () => {
    const hidden = 2;
    const episodes = makeEpisodes(EPISODES_INITIAL + hidden);
    render(<EpisodeRecommendations episodes={episodes} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /show.*more/i }));

    const lessBtn = screen.getByRole("button", { name: /show less/i });
    expect(lessBtn).toBeInTheDocument();

    await user.click(lessBtn);

    const links = screen.getAllByRole("link", { name: /Episode/ });
    expect(links).toHaveLength(EPISODES_INITIAL);
    expect(
      screen.queryByRole("button", { name: /show less/i }),
    ).not.toBeInTheDocument();
    // Re-collapse restores the original "Show N more" label with the correct count
    expect(
      screen.getByRole("button", { name: `Show ${hidden} more` }),
    ).toBeInTheDocument();
  });

  it("toggle button reports aria-expanded state accurately through expand/collapse", async () => {
    const episodes = makeEpisodes(EPISODES_INITIAL + 2);
    render(<EpisodeRecommendations episodes={episodes} />);

    const user = userEvent.setup();
    const initial = screen.getByRole("button", { name: /show.*more/i });
    expect(initial).toHaveAttribute("aria-expanded", "false");

    await user.click(initial);
    expect(screen.getByRole("button", { name: /show less/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("toggle button is absent when episodes.length < EPISODES_INITIAL", () => {
    const episodes = makeEpisodes(EPISODES_INITIAL - 1);
    render(<EpisodeRecommendations episodes={episodes} />);
    expect(
      screen.queryByRole("button", { name: /show/i }),
    ).not.toBeInTheDocument();
  });

  it("toggle button is absent when exactly EPISODES_INITIAL episodes are provided (boundary: N > N is false)", () => {
    const episodes = makeEpisodes(EPISODES_INITIAL);
    render(<EpisodeRecommendations episodes={episodes} />);
    expect(
      screen.queryByRole("button", { name: /show/i }),
    ).not.toBeInTheDocument();
  });

  it("toggle button label shows correct hidden count", () => {
    const hidden = 4;
    const episodes = makeEpisodes(EPISODES_INITIAL + hidden);
    render(<EpisodeRecommendations episodes={episodes} />);
    expect(
      screen.getByRole("button", { name: `Show ${hidden} more` }),
    ).toBeInTheDocument();
  });

  it("renders 'Show 1 more' when exactly EPISODES_INITIAL + 1 episodes are provided (singular-count boundary)", () => {
    const episodes = makeEpisodes(EPISODES_INITIAL + 1);
    render(<EpisodeRecommendations episodes={episodes} />);
    expect(
      screen.getByRole("button", { name: "Show 1 more" }),
    ).toBeInTheDocument();
  });

  it("renders empty state when episodes array is empty", () => {
    render(<EpisodeRecommendations episodes={[]} />);
    expect(screen.getByText("No recommendations yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /show/i }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// EpisodeRecommendationsLoading
// ---------------------------------------------------------------------------

describe("EpisodeRecommendationsLoading", () => {
  it("renders EPISODES_INITIAL skeleton placeholder rows", () => {
    render(<EpisodeRecommendationsLoading />);
    expect(screen.getAllByTestId("episode-loading-row")).toHaveLength(
      EPISODES_INITIAL,
    );
  });
});
