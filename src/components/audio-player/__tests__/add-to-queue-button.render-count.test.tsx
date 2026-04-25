import { Profiler, type ProfilerOnRenderCallback } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  AudioPlayerProvider,
  useAudioPlayerAPI,
  type AudioEpisode,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context";
import { AddToQueueButton } from "@/components/audio-player/add-to-queue-button";

// ── Provider dependencies ────────────────────────────────────────────────────
// These mocks must live here (not in a helper) because vi.mock() is hoisted.

vi.mock("@/lib/media-session", () => ({
  updateMediaSessionMetadata: vi.fn(),
  setupMediaSessionHandlers: vi.fn(),
  updateMediaSessionPosition: vi.fn(),
  clearMediaSession: vi.fn(),
}));

vi.mock("@/app/actions/listen-history", () => ({
  recordListenEvent: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/player-preferences", () => ({
  loadPlayerPreferences: vi
    .fn()
    .mockReturnValue({ volume: 1, playbackSpeed: 1 }),
  savePlayerPreferences: vi.fn(),
}));

vi.mock("@/lib/queue-persistence", () => ({
  loadQueue: vi.fn().mockReturnValue([]),
  saveQueue: vi.fn(),
}));

vi.mock("@/lib/player-session", () => ({
  loadPlayerSession: vi.fn().mockReturnValue(null),
  savePlayerSession: vi.fn(),
  clearPlayerSession: vi.fn(),
}));

// Server actions called by the provider's cross-device sync effects.
// Without these, the effects throw when userId is non-null (test-user-id from
// the global Clerk mock), which interferes with state updates.
vi.mock("@/app/actions/listening-queue", () => ({
  getQueue: vi.fn().mockResolvedValue({ success: true, data: [] }),
  setQueue: vi.fn().mockResolvedValue({ success: true }),
  clearQueue: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/app/actions/player-session", () => ({
  getPlayerSession: vi.fn().mockResolvedValue({ success: true, data: null }),
  savePlayerSession: vi.fn().mockResolvedValue({ success: true }),
  clearPlayerSession: vi.fn().mockResolvedValue({ success: true }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const testEpisode: AudioEpisode = {
  id: "ep-queue-test",
  title: "Queue Test Episode",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/audio.mp3",
  duration: 600,
};

const unrelatedEpisode: AudioEpisode = {
  id: "ep-unrelated",
  title: "Unrelated Episode",
  podcastTitle: "Other Podcast",
  audioUrl: "https://example.com/other.mp3",
  duration: 300,
};

const secondQueueEpisode: AudioEpisode = {
  id: "ep-second-in-queue",
  title: "Second Queue Episode",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/second.mp3",
  duration: 450,
};

// ── Render-count infrastructure ───────────────────────────────────────────────
// React.Profiler measures AddToQueueButton's actual renders regardless of how
// it subscribes to contexts. A regression that re-adds useAudioPlayerState()
// will cause setVolume/setPlaybackSpeed/buffering/isPlaying changes to
// increment renders and fail the isolation tests. Mirror-subscription wrappers
// cannot catch fat-context regressions — Profiler can.

let renders = 0;
let capturedAPI: AudioPlayerAPI | null = null;

// onRender fires on every commit-phase render of any component inside the
// Profiler tree. Resets to 0 in beforeEach so each test starts clean.
const onRender: ProfilerOnRenderCallback = () => {
  renders += 1;
};

// Captures the real API handle so tests can dispatch actions inside act().
function APIBridge() {
  capturedAPI = useAudioPlayerAPI();
  return null;
}

function TestTree({ episode }: { episode: AudioEpisode }) {
  return (
    <AudioPlayerProvider>
      <Profiler id="add-to-queue-button" onRender={onRender}>
        <AddToQueueButton episode={episode} />
      </Profiler>
      <APIBridge />
    </AudioPlayerProvider>
  );
}

describe("AddToQueueButton render counts (real AudioPlayerProvider)", () => {
  beforeEach(() => {
    // Reset counters so tests are independent of each other.
    renders = 0;
    capturedAPI = null;

    // jsdom doesn't implement HTMLMediaElement natively; stub what the provider needs.
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.load = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "buffered", {
      configurable: true,
      get() {
        return { length: 1, start: () => 0, end: () => 150 };
      },
    });
  });

  // ── Isolation assertions (the core of the PR) ──────────────────────────────

  it("does not re-render when setVolume(0.5) is dispatched", () => {
    render(<TestTree episode={testEpisode} />);
    const baseline = renders;
    act(() => capturedAPI!.setVolume(0.5));
    expect(renders).toBe(baseline);
  });

  it("does not re-render when setPlaybackSpeed(1.5) is dispatched", () => {
    render(<TestTree episode={testEpisode} />);
    const baseline = renders;
    act(() => capturedAPI!.setPlaybackSpeed(1.5));
    expect(renders).toBe(baseline);
  });

  it("does not re-render when a 'waiting' audio event fires (buffering tick)", () => {
    render(<TestTree episode={testEpisode} />);
    const baseline = renders;
    act(() => {
      const audio = document.querySelector("audio");
      audio?.dispatchEvent(new Event("waiting"));
    });
    expect(renders).toBe(baseline);
  });

  it("does not re-render when setSleepTimer(10) is dispatched", () => {
    render(<TestTree episode={testEpisode} />);
    const baseline = renders;
    act(() => capturedAPI!.setSleepTimer(10));
    expect(renders).toBe(baseline);
  });

  // AddToQueueButton does not subscribe to IsPlayingContext. Fire the 'pause'
  // event directly to change IsPlayingContext (via the provider's onPause
  // handler) and verify AddToQueueButton does not re-render.
  it("does not re-render when isPlaying toggles for an unrelated episode", async () => {
    render(<TestTree episode={testEpisode} />);
    await act(async () => capturedAPI!.playEpisode(unrelatedEpisode));
    const baseline = renders;
    act(() => {
      const audio = document.querySelector("audio");
      audio?.dispatchEvent(new Event("pause"));
    });
    expect(renders).toBe(baseline);
  });

  // REORDER_QUEUE produces a new queue array but identical membership.
  // QueueEpisodeIdsContext memoizes on content equality, so the Set reference
  // stays stable across reorders and queue-aware consumers must not re-render.
  it("does not re-render when REORDER_QUEUE leaves membership unchanged", async () => {
    render(<TestTree episode={testEpisode} />);
    await act(async () => capturedAPI!.playEpisode(unrelatedEpisode));
    await act(async () => capturedAPI!.addToQueue(testEpisode));
    await act(async () => capturedAPI!.addToQueue(secondQueueEpisode));
    const baseline = renders;
    act(() => capturedAPI!.reorderQueue(0, 1));
    expect(renders).toBe(baseline);
  });

  // ── Sanity assertion (verify the button still reacts to queue changes) ──────

  it("re-renders when its episode is added to the queue", async () => {
    render(<TestTree episode={testEpisode} />);
    // Play something else first so addToQueue dispatches ADD_TO_QUEUE rather
    // than falling back to playEpisode (the provider skips queuing when nothing
    // is loaded). Also moves past the NowPlayingEpisodeId change before baseline.
    await act(async () => capturedAPI!.playEpisode(unrelatedEpisode));
    const baseline = renders;
    act(() => capturedAPI!.addToQueue(testEpisode));
    expect(renders).toBeGreaterThan(baseline);
  });
});
