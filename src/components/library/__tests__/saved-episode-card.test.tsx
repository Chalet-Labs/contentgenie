import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SavedEpisodeCard } from "@/components/library/saved-episode-card";
import type { SavedItemDTO, CanonicalTopicChip } from "@/db/library-columns";
import { asPodcastIndexEpisodeId } from "@/types/ids";
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
    "aria-hidden": ariaHidden,
    tabIndex,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-label"?: string;
    "aria-hidden"?: boolean | "true" | "false";
    tabIndex?: number;
    onClick?: () => void;
  }) => (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
      tabIndex={tabIndex}
      onClick={onClick}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/app/actions/library", () => ({
  removeEpisodeFromLibrary: vi.fn().mockResolvedValue({ success: true }),
  updateLibraryRating: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/contexts/sidebar-counts-context", () => ({
  useSidebarCountsOptional: () => ({ refreshCounts: vi.fn() }),
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
  useIsEpisodePlaying: () => false,
  useIsEpisodeInQueue: () => false,
}));

// Stub heavy sub-components to avoid unrelated mock chains
vi.mock("@/components/library/move-to-collection", () => ({
  MoveToCollection: () => null,
}));

vi.mock("@/components/library/notes-editor", () => ({
  NotesEditor: () => null,
}));

vi.mock("@/components/library/bookmarks-list", () => ({
  BookmarksList: () => null,
}));

const podcastIndexId = asPodcastIndexEpisodeId("PI-42");

const baseItem: SavedItemDTO = {
  id: 1,
  userId: "user_abc",
  episodeId: 100,
  savedAt: new Date("2024-01-15"),
  notes: null,
  rating: null,
  collectionId: null,
  episode: {
    id: 100,
    podcastIndexId,
    title: "Deep Dive into LLMs",
    description: "An episode about large language models",
    audioUrl: "https://example.com/audio.mp3",
    duration: 3600,
    publishDate: new Date("2024-01-01"),
    worthItScore: null,
    podcast: {
      id: 10,
      podcastIndexId: "PC-10",
      title: "Tech Talk Daily",
      imageUrl: null,
    },
  },
};

const sampleChips: CanonicalTopicChip[] = [
  { id: 1, label: "Creatine", kind: "concept" },
  { id: 2, label: "AI Safety", kind: "regulation" },
  { id: 3, label: "GPU shortage", kind: "incident" },
  { id: 4, label: "Google I/O", kind: "event" },
];

describe("SavedEpisodeCard — canonical topics", () => {
  it("renders episode title", () => {
    render(<SavedEpisodeCard item={baseItem} />);
    expect(screen.getByText("Deep Dive into LLMs")).toBeInTheDocument();
  });

  it("renders chip links when canonicalTopics is non-empty", () => {
    render(
      <SavedEpisodeCard
        item={{
          ...baseItem,
          episode: { ...baseItem.episode, canonicalTopics: sampleChips },
        }}
      />,
    );
    expect(
      screen.getAllByRole("link", { name: /^Topic:/i }).length,
    ).toBeGreaterThan(0);
  });

  it("renders no chip row when canonicalTopics is undefined", () => {
    render(<SavedEpisodeCard item={baseItem} />);
    expect(
      screen.queryByRole("link", { name: /^Topic:/i }),
    ).not.toBeInTheDocument();
  });

  it("caps at 3 chips even when more are supplied", () => {
    render(
      <SavedEpisodeCard
        item={{
          ...baseItem,
          episode: { ...baseItem.episode, canonicalTopics: sampleChips },
        }}
      />,
    );
    const chips = screen.getAllByRole("link", { name: /^Topic:/i });
    expect(chips).toHaveLength(3);
  });
});

describe("SavedEpisodeCard — overlap indicator", () => {
  const repeatOverlap: CanonicalOverlapResult = {
    kind: "repeat",
    count: 2,
    topicLabel: "gut health",
    topicId: 20,
  };
  const newOverlap: CanonicalOverlapResult = {
    kind: "new",
    topicLabel: "longevity",
    topicId: 21,
  };

  it("renders canonical repeat indicator when canonicalOverlap is set", () => {
    render(
      <SavedEpisodeCard item={baseItem} canonicalOverlap={repeatOverlap} />,
    );
    const indicator = screen.getByTestId("overlap-indicator");
    expect(indicator).toHaveTextContent(
      "You've heard 2 episodes on gut health",
    );
    expect(indicator).toHaveAttribute("data-canonical-overlap-kind", "repeat");
  });

  it("renders canonical new indicator when canonicalOverlap kind is new", () => {
    render(<SavedEpisodeCard item={baseItem} canonicalOverlap={newOverlap} />);
    const indicator = screen.getByTestId("overlap-indicator");
    expect(indicator).toHaveTextContent("New: longevity");
    expect(indicator).toHaveAttribute("data-canonical-overlap-kind", "new");
  });

  it("renders no indicator when canonicalOverlap is null", () => {
    render(<SavedEpisodeCard item={baseItem} canonicalOverlap={null} />);
    expect(screen.queryByTestId("overlap-indicator")).not.toBeInTheDocument();
  });
});
