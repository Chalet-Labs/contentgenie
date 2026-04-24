import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecentEpisode } from "@/app/actions/dashboard";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetRecentEpisodes = vi.fn();
vi.mock("@/app/actions/dashboard", () => ({
  getRecentEpisodesFromSubscriptions: (...args: unknown[]) =>
    mockGetRecentEpisodes(...args),
}));

// RecentEpisodes is a presentational child — render a minimal stub
vi.mock("@/components/dashboard/recent-episodes", () => ({
  RecentEpisodes: ({
    episodes,
    isLoading,
    canToggle,
  }: {
    episodes: RecentEpisode[];
    isLoading?: boolean;
    hasSubscriptions?: boolean;
    canToggle?: boolean;
  }) => (
    <div data-testid="recent-episodes" data-can-toggle={canToggle}>
      {isLoading && <span data-testid="loading">Loading</span>}
      {episodes.map((ep) => (
        <span key={ep.id} data-testid={`episode-${ep.id}`}>
          {ep.title}
        </span>
      ))}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEpisode(id: number, title = `Episode ${id}`): RecentEpisode {
  return {
    id,
    title,
    feedId: 100,
    datePublished: 1_000_000,
    duration: 1800,
    description: null,
    feedImage: null,
    enclosureUrl: null,
    podcastTitle: "Test Podcast",
    podcastImage: null,
    podcastId: "100",
    worthItScore: null,
  } as unknown as RecentEpisode;
}

const SINCE_LAST_LOGIN = 1_800_000;

async function renderContainer(overrides?: {
  sinceLastLogin?: number | null;
  initialEpisodes?: RecentEpisode[];
}) {
  const { RecentEpisodesContainer } =
    await import("@/components/dashboard/recent-episodes-container");
  return render(
    <RecentEpisodesContainer
      initialEpisodes={overrides?.initialEpisodes ?? [makeEpisode(1)]}
      sinceLastLogin={
        overrides?.sinceLastLogin !== undefined
          ? overrides.sinceLastLogin
          : SINCE_LAST_LOGIN
      }
      hasSubscriptions={true}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RecentEpisodesContainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRecentEpisodes.mockResolvedValue({
      episodes: [],
      hasSubscriptions: true,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("renders both toggle buttons when sinceLastLogin is provided", async () => {
    await renderContainer();

    expect(
      screen.getByRole("button", { name: /last week/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /since last login/i }),
    ).toBeInTheDocument();
  });

  it("hides the entire toggle group (including 'Last week') when sinceLastLogin is null", async () => {
    await renderContainer({ sinceLastLogin: null });

    // Toggle group is hidden entirely when there's no meaningful login boundary
    expect(screen.queryByText(/last week/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/since last login/i)).not.toBeInTheDocument();
  });

  it("renders initial episodes without calling the server action", async () => {
    const initial = [
      makeEpisode(10, "Initial Ep"),
      makeEpisode(11, "Another Ep"),
    ];
    await renderContainer({ initialEpisodes: initial });

    expect(screen.getByTestId("episode-10")).toBeInTheDocument();
    expect(screen.getByTestId("episode-11")).toBeInTheDocument();
    expect(mockGetRecentEpisodes).not.toHaveBeenCalled();
  });

  it("calls server action with sinceLastLogin when 'Since last login' is clicked", async () => {
    const returnedEpisodes = [makeEpisode(99, "Login Ep")];
    mockGetRecentEpisodes.mockResolvedValue({
      episodes: returnedEpisodes,
      hasSubscriptions: true,
      error: null,
    });

    await renderContainer();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /since last login/i }));

    await waitFor(() => {
      expect(mockGetRecentEpisodes).toHaveBeenCalledWith({
        limit: 5,
        since: SINCE_LAST_LOGIN,
      });
    });
  });

  it("updates displayed episodes after toggling to 'Since last login'", async () => {
    const loginEpisodes = [makeEpisode(77, "Login Episode")];
    mockGetRecentEpisodes.mockResolvedValue({
      episodes: loginEpisodes,
      hasSubscriptions: true,
      error: null,
    });

    await renderContainer({ initialEpisodes: [makeEpisode(1, "Week Ep")] });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /since last login/i }));

    await waitFor(() => {
      expect(screen.getByTestId("episode-77")).toBeInTheDocument();
    });
  });

  it("preserves existing episodes when server action returns an error", async () => {
    mockGetRecentEpisodes.mockResolvedValue({
      episodes: [],
      hasSubscriptions: true,
      error: "Failed to load recent episodes",
    });

    const initial = [makeEpisode(1, "Keep Me")];
    await renderContainer({ initialEpisodes: initial });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /since last login/i }));

    await waitFor(() => {
      expect(mockGetRecentEpisodes).toHaveBeenCalledTimes(1);
    });

    // Original episodes should still be displayed since the action returned an error
    expect(screen.getByTestId("episode-1")).toBeInTheDocument();
  });

  it("calls server action with fresh sinceLastWeek when 'Last week' is clicked after switching away", async () => {
    const mockNow = 1_710_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(mockNow);
    const expectedSinceWeek = Math.floor(
      (mockNow - 7 * 24 * 60 * 60 * 1000) / 1000,
    );

    const weekEpisodes = [makeEpisode(55, "Week Ep")];
    // First call: login toggle, second call: back to week
    mockGetRecentEpisodes
      .mockResolvedValueOnce({
        episodes: [],
        hasSubscriptions: true,
        error: null,
      })
      .mockResolvedValueOnce({
        episodes: weekEpisodes,
        hasSubscriptions: true,
        error: null,
      });

    await renderContainer();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /since last login/i }));
    await waitFor(() => expect(mockGetRecentEpisodes).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /last week/i }));
    await waitFor(() => {
      expect(mockGetRecentEpisodes).toHaveBeenCalledWith({
        limit: 5,
        since: expectedSinceWeek,
      });
    });
  });
});
