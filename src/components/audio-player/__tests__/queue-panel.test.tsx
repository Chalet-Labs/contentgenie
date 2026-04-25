import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DragEndEvent } from "@dnd-kit/core";
import type { AudioEpisode } from "@/contexts/audio-player-context";
import { validEpisode, validEpisode2 } from "@/test/fixtures/audio-episode";

// jsdom doesn't provide ResizeObserver — Radix Popover and the DnD libs need it
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  MockResizeObserver as unknown as typeof ResizeObserver;

// jsdom doesn't provide matchMedia — useMediaQuery uses window.matchMedia(query)
function fakeMediaQueryList(matches: boolean, query: string) {
  return {
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}
const matchMediaMock = vi
  .fn()
  .mockImplementation((q: string) => fakeMediaQueryList(false, q));
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: matchMediaMock,
});

// ── Audio-player context mock ────────────────────────────────────────────
const mockState = {
  currentEpisode: null as AudioEpisode | null,
  isPlaying: false,
  isBuffering: false,
  isVisible: false,
  duration: 0,
  volume: 1,
  playbackSpeed: 1,
  hasError: false,
  errorMessage: null as string | null,
  queue: [] as AudioEpisode[],
  chapters: null,
  chaptersLoading: false,
  sleepTimer: null,
};

const mockAPI = {
  playEpisode: vi.fn(),
  togglePlay: vi.fn(),
  seek: vi.fn(),
  skipForward: vi.fn(),
  skipBack: vi.fn(),
  getCurrentTime: vi.fn(() => 0),
  setVolume: vi.fn(),
  setPlaybackSpeed: vi.fn(),
  closePlayer: vi.fn(),
  addToQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderQueue: vi.fn(),
  clearQueue: vi.fn(),
  playNext: vi.fn(),
  setSleepTimer: vi.fn(),
  cancelSleepTimer: vi.fn(),
};

vi.mock("@/contexts/audio-player-context", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/contexts/audio-player-context")>();
  return {
    ...actual,
    useAudioPlayerState: () => mockState,
    useAudioPlayerAPI: () => mockAPI,
  };
});

// ── Popover mock that respects the `open` prop ───────────────────────────
vi.mock("@/components/ui/popover", () => ({
  Popover: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange?: (v: boolean) => void;
    children: React.ReactNode;
  }) => <div data-testid="popover-root">{open ? children : null}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

// ── Sheet mock that respects the `open` prop ─────────────────────────────
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange?: (v: boolean) => void;
    children: React.ReactNode;
  }) => <div data-testid="sheet-root">{open ? children : null}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-trigger">{children}</div>
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-header">{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-title">{children}</div>
  ),
  SheetDescription: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="sheet-description" className={className}>
      {children}
    </div>
  ),
}));

// ── @dnd-kit mocks: capture onDragEnd, neuter SortableContext/useSortable ─
let capturedOnDragEnd: ((e: DragEndEvent) => void) | undefined;

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragEnd: (e: DragEndEvent) => void;
    }) => {
      capturedOnDragEnd = onDragEnd;
      return <>{children}</>;
    },
    useSensor: vi.fn(() => ({})),
    useSensors: vi.fn(() => []),
  };
});

vi.mock("@dnd-kit/sortable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/sortable")>();
  return {
    ...actual,
    SortableContext: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
    sortableKeyboardCoordinates: vi.fn(),
    verticalListSortingStrategy: vi.fn(),
  };
});

import { QueuePanel } from "@/components/audio-player/queue-panel";
import { Button } from "@/components/ui/button";

const trigger = <Button aria-label="Open queue">Q</Button>;

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnDragEnd = undefined;
  // Mutate mockState in place — the context mock closes over this reference,
  // so reassigning it would orphan the closure.
  Object.assign(mockState, {
    currentEpisode: null,
    queue: [],
    isPlaying: false,
    isBuffering: false,
    isVisible: false,
    duration: 0,
    hasError: false,
    errorMessage: null,
    chapters: null,
    chaptersLoading: false,
    sleepTimer: null,
  });
  // QueuePanel queries `(min-width: 768px)`, so `matches: false` selects
  // the Sheet (narrow-viewport) branch. Tests targeting Popover override.
  matchMediaMock.mockImplementation((q: string) =>
    fakeMediaQueryList(false, q),
  );
});

afterEach(() => vi.restoreAllMocks());

// ── NowPlaying ────────────────────────────────────────────────────────────
describe("NowPlaying", () => {
  it("renders nothing when no current episode", () => {
    mockState.currentEpisode = null;
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    expect(screen.queryByText("Now Playing")).not.toBeInTheDocument();
  });

  it("renders current episode title and podcast title", () => {
    mockState.currentEpisode = validEpisode;
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    expect(screen.getByText("Now Playing")).toBeInTheDocument();
    expect(screen.getByText(validEpisode.title)).toBeInTheDocument();
    expect(screen.getByText(validEpisode.podcastTitle)).toBeInTheDocument();
  });

  it("renders artwork image when episode has artwork", () => {
    mockState.currentEpisode = validEpisode;
    const { container } = render(
      <QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />,
    );
    const imgs = Array.from(container.querySelectorAll("img"));
    const artworkImg = imgs.find(
      (node) => node.getAttribute("src") === validEpisode.artwork,
    );
    expect(artworkImg).toBeDefined();
  });

  it("renders Rss icon fallback when episode has no artwork", () => {
    mockState.currentEpisode = validEpisode2;
    const { container } = render(
      <QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />,
    );
    // Fallback path renders the Rss SVG icon, so no <img> elements exist.
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(0);
  });
});

// ── QueueList — empty state ──────────────────────────────────────────────
describe("QueueList — empty queue", () => {
  it("shows empty-state heading when queue is empty", () => {
    mockState.queue = [];
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    expect(screen.getByText("Your queue is empty")).toBeInTheDocument();
    expect(
      screen.getByText("Add episodes from episode pages or cards"),
    ).toBeInTheDocument();
  });

  it("does not show 'Up Next' label when empty", () => {
    mockState.queue = [];
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    expect(screen.queryByText("Up Next")).not.toBeInTheDocument();
    expect(screen.queryByText("Clear all")).not.toBeInTheDocument();
  });
});

// ── QueueList — populated ────────────────────────────────────────────────
describe("QueueList — populated queue", () => {
  beforeEach(() => {
    mockState.queue = [validEpisode, validEpisode2];
  });

  it("renders 'Up Next' heading and count badge", () => {
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    expect(screen.getByText("Up Next")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders one row per episode in the queue", () => {
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    expect(
      screen.getByRole("button", { name: `Play ${validEpisode.title}` }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Play ${validEpisode2.title}` }),
    ).toBeInTheDocument();
  });

  it("calls clearQueue when 'Clear all' button is clicked", async () => {
    const user = userEvent.setup();
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    await user.click(screen.getByRole("button", { name: /clear all/i }));
    expect(mockAPI.clearQueue).toHaveBeenCalledTimes(1);
  });

  it("calls playEpisode AND removeFromQueue when an item's play button is clicked", async () => {
    const user = userEvent.setup();
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    await user.click(
      screen.getByRole("button", { name: `Play ${validEpisode.title}` }),
    );
    expect(mockAPI.playEpisode).toHaveBeenCalledWith(validEpisode);
    expect(mockAPI.removeFromQueue).toHaveBeenCalledWith(validEpisode.id);
  });

  it("calls removeFromQueue when an item's remove button is clicked", async () => {
    const user = userEvent.setup();
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    await user.click(
      screen.getByRole("button", {
        name: `Remove ${validEpisode2.title} from queue`,
      }),
    );
    expect(mockAPI.removeFromQueue).toHaveBeenCalledWith(validEpisode2.id);
    expect(mockAPI.playEpisode).not.toHaveBeenCalled();
  });
});

// ── handleDragEnd ────────────────────────────────────────────────────────
describe("handleDragEnd", () => {
  beforeEach(() => {
    mockState.queue = [validEpisode, validEpisode2];
  });

  it("reorders queue when dropping over a different item", () => {
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    expect(capturedOnDragEnd).toBeDefined();
    act(() => {
      capturedOnDragEnd!({
        active: { id: validEpisode.id },
        over: { id: validEpisode2.id },
      } as unknown as DragEndEvent);
    });
    expect(mockAPI.reorderQueue).toHaveBeenCalledWith(0, 1);
  });

  it("is a no-op when active.id equals over.id", () => {
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    act(() => {
      capturedOnDragEnd!({
        active: { id: validEpisode.id },
        over: { id: validEpisode.id },
      } as unknown as DragEndEvent);
    });
    expect(mockAPI.reorderQueue).not.toHaveBeenCalled();
  });

  it("is a no-op when over is null", () => {
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    act(() => {
      capturedOnDragEnd!({
        active: { id: validEpisode.id },
        over: null,
      } as unknown as DragEndEvent);
    });
    expect(mockAPI.reorderQueue).not.toHaveBeenCalled();
  });

  it("is a no-op when an id is not in the current queue", () => {
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    act(() => {
      capturedOnDragEnd!({
        active: { id: "missing-id" },
        over: { id: validEpisode.id },
      } as unknown as DragEndEvent);
    });
    expect(mockAPI.reorderQueue).not.toHaveBeenCalled();
  });
});

// ── Layout switch (desktop vs mobile) ────────────────────────────────────
describe("layout switch", () => {
  it("renders inside Popover when matchMedia matches the min-width query", () => {
    matchMediaMock.mockImplementation((q: string) =>
      fakeMediaQueryList(true, q),
    );
    mockState.queue = [];
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    expect(screen.getByTestId("popover-content")).toBeInTheDocument();
    expect(screen.queryByTestId("sheet-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sheet-title")).not.toBeInTheDocument();
  });

  it("renders inside Sheet with title and sr-only description when the query does not match", () => {
    mockState.queue = [];
    render(<QueuePanel open={true} onOpenChange={vi.fn()} trigger={trigger} />);
    expect(screen.getByTestId("sheet-content")).toBeInTheDocument();
    expect(screen.queryByTestId("popover-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("sheet-title")).toHaveTextContent("Queue");
    const description = screen.getByTestId("sheet-description");
    expect(description).toHaveTextContent("Manage your episode queue");
    expect(description.className).toContain("sr-only");
  });
});
