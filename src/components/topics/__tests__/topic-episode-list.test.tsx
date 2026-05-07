import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseQueryState = vi.fn();
const mockRefresh = vi.fn();

vi.mock("nuqs", () => ({
  useQueryState: (...args: unknown[]) => mockUseQueryState(...args),
}));

// Stub the search-params module so withOptions doesn't need a real nuqs parser.
vi.mock("@/lib/search-params/topic-detail", () => ({
  topicDetailSearchParams: {
    unheard: {
      withDefault: () => ({ __brand: "parseAsBoolean", defaultValue: false }),
      withOptions: () => ({ __brand: "parseAsBoolean", defaultValue: false }),
    },
  },
  loadTopicDetailSearchParams: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { TopicEpisodeList } from "@/components/topics/topic-episode-list";
import type { TopicEpisode } from "@/app/actions/topics";
import { asPodcastIndexEpisodeId } from "@/types/ids";

function makeEpisode(overrides: Partial<TopicEpisode> = {}): TopicEpisode {
  return {
    id: 1,
    podcastIndexEpisodeId: asPodcastIndexEpisodeId("pi-1"),
    title: "Episode title",
    podcastTitle: "Podcast A",
    podcastFeedId: "feed-1",
    coverageScore: 0.8,
    isListened: false,
    isSaved: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQueryState.mockReturnValue([false, vi.fn()]);
});

describe("TopicEpisodeList", () => {
  it("renders rows in the order of the given episodes array (server-side sort preserved)", () => {
    const episodes = [
      makeEpisode({ id: 1, title: "First", coverageScore: 0.9 }),
      makeEpisode({ id: 2, title: "Second", coverageScore: 0.7 }),
      makeEpisode({ id: 3, title: "Third", coverageScore: 0.5 }),
    ];
    render(<TopicEpisodeList episodes={episodes} />);
    const rows = screen.getAllByRole("row").slice(1); // skip header row
    const titles = rows.map(
      (row) => within(row).getByRole("link").textContent ?? "",
    );
    expect(titles).toEqual(["First", "Second", "Third"]);
  });

  it("renders coverageScore as a percentage in each row", () => {
    render(
      <TopicEpisodeList
        episodes={[makeEpisode({ id: 1, coverageScore: 0.92 })]}
      />,
    );
    expect(screen.getByText(/92%/)).toBeInTheDocument();
  });

  it("renders 'Listened' badge for episodes the user has heard", () => {
    render(
      <TopicEpisodeList
        episodes={[makeEpisode({ id: 1, isListened: true })]}
      />,
    );
    expect(screen.getByText(/Listened/i)).toBeInTheDocument();
  });

  it("renders 'Saved' badge for episodes in the user's library", () => {
    render(
      <TopicEpisodeList episodes={[makeEpisode({ id: 1, isSaved: true })]} />,
    );
    expect(screen.getByText(/Saved/i)).toBeInTheDocument();
  });

  it("toggle reads the unheard state from useQueryState", () => {
    mockUseQueryState.mockReturnValue([true, vi.fn()]);
    render(<TopicEpisodeList episodes={[makeEpisode()]} />);
    const toggle = screen.getByRole("checkbox", {
      name: /show only episodes I haven't heard/i,
    });
    expect(toggle).toBeChecked();
  });

  it("toggling fires the nuqs setter (shallow:false handles refresh via nuqs)", async () => {
    const user = userEvent.setup();
    const setter = vi.fn().mockResolvedValue(undefined);
    mockUseQueryState.mockReturnValue([false, setter]);
    render(<TopicEpisodeList episodes={[makeEpisode()]} />);
    const toggle = screen.getByRole("checkbox", {
      name: /show only episodes I haven't heard/i,
    });
    await user.click(toggle);
    expect(setter).toHaveBeenCalledWith(true);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("row link points to /podcast/<feedId>?episode=<podcastIndexEpisodeId>", () => {
    render(
      <TopicEpisodeList
        episodes={[
          makeEpisode({
            id: 1,
            podcastFeedId: "feed-77",
            podcastIndexEpisodeId: asPodcastIndexEpisodeId("pi-42"),
          }),
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /Episode title/ });
    expect(link).toHaveAttribute("href", "/podcast/feed-77?episode=pi-42");
  });

  it("renders 'All caught up' message when filter is on and result is empty", () => {
    mockUseQueryState.mockReturnValue([true, vi.fn()]);
    render(<TopicEpisodeList episodes={[]} />);
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it("renders 'No episodes yet' fallback when filter is off and list is empty", () => {
    mockUseQueryState.mockReturnValue([false, vi.fn()]);
    render(<TopicEpisodeList episodes={[]} />);
    expect(screen.getByText(/no episodes yet/i)).toBeInTheDocument();
  });
});
