import { Profiler } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  AudioPlayerProvider,
  type AudioEpisode,
} from "@/contexts/audio-player-context";
import { asPodcastIndexEpisodeId } from "@/types/ids";
import { AddToQueueButton } from "@/components/audio-player/add-to-queue-button";
import {
  createRenderCountHarness,
  stubHTMLMediaElement,
  restoreHTMLMediaElement,
} from "@/test/helpers/audio-player-render-count";

// vi.mock() must live in each render-count test file because vi.mock() is
// hoisted per-file — a shared helper module can't host it.

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

const testEpisode: AudioEpisode = {
  id: asPodcastIndexEpisodeId("ep-queue-test"),
  title: "Queue Test Episode",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/audio.mp3",
  duration: 600,
};

const unrelatedEpisode: AudioEpisode = {
  id: asPodcastIndexEpisodeId("ep-unrelated"),
  title: "Unrelated Episode",
  podcastTitle: "Other Podcast",
  audioUrl: "https://example.com/other.mp3",
  duration: 300,
};

const secondQueueEpisode: AudioEpisode = {
  id: asPodcastIndexEpisodeId("ep-second-in-queue"),
  title: "Second Queue Episode",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/second.mp3",
  duration: 450,
};

// React.Profiler measures AddToQueueButton's actual renders regardless of how
// it subscribes to contexts. A regression that re-adds useAudioPlayerState()
// will cause setVolume/setPlaybackSpeed/buffering/isPlaying changes to
// increment renders and fail the isolation tests. Mirror-subscription wrappers
// cannot catch fat-context regressions — Profiler can.
const harness = createRenderCountHarness();

function TestTree({ episode }: { episode: AudioEpisode }) {
  return (
    <AudioPlayerProvider>
      <Profiler id="add-to-queue-button" onRender={harness.onRender}>
        <AddToQueueButton episode={episode} />
      </Profiler>
      <harness.APIBridge />
    </AudioPlayerProvider>
  );
}

describe("AddToQueueButton render counts (real AudioPlayerProvider)", () => {
  beforeEach(() => {
    harness.reset();
    stubHTMLMediaElement();
  });

  afterEach(() => {
    restoreHTMLMediaElement();
  });

  it("does not re-render when setVolume(0.5) is dispatched", () => {
    render(<TestTree episode={testEpisode} />);
    const baseline = harness.renders;
    act(() => harness.api!.setVolume(0.5));
    expect(harness.renders).toBe(baseline);
  });

  it("does not re-render when setPlaybackSpeed(1.5) is dispatched", () => {
    render(<TestTree episode={testEpisode} />);
    const baseline = harness.renders;
    act(() => harness.api!.setPlaybackSpeed(1.5));
    expect(harness.renders).toBe(baseline);
  });

  it("does not re-render when a 'waiting' audio event fires (buffering tick)", () => {
    render(<TestTree episode={testEpisode} />);
    const baseline = harness.renders;
    act(() => {
      const audio = document.querySelector("audio");
      audio?.dispatchEvent(new Event("waiting"));
    });
    expect(harness.renders).toBe(baseline);
  });

  it("does not re-render when setSleepTimer(10) is dispatched", () => {
    render(<TestTree episode={testEpisode} />);
    const baseline = harness.renders;
    act(() => harness.api!.setSleepTimer(10));
    expect(harness.renders).toBe(baseline);
  });

  // AddToQueueButton does not subscribe to IsPlayingContext. Fire the 'pause'
  // event directly to change IsPlayingContext (via the provider's onPause
  // handler) and verify AddToQueueButton does not re-render.
  it("does not re-render when isPlaying toggles for an unrelated episode", async () => {
    render(<TestTree episode={testEpisode} />);
    await act(async () => harness.api!.playEpisode(unrelatedEpisode));
    const baseline = harness.renders;
    act(() => {
      const audio = document.querySelector("audio");
      audio?.dispatchEvent(new Event("pause"));
    });
    expect(harness.renders).toBe(baseline);
  });

  // REORDER_QUEUE produces a new queue array but identical membership.
  // QueueEpisodeIdsContext memoizes on content equality, so the Set reference
  // stays stable across reorders and queue-aware consumers must not re-render.
  it("does not re-render when REORDER_QUEUE leaves membership unchanged", async () => {
    render(<TestTree episode={testEpisode} />);
    await act(async () => harness.api!.playEpisode(unrelatedEpisode));
    await act(async () => harness.api!.addToQueue(testEpisode));
    await act(async () => harness.api!.addToQueue(secondQueueEpisode));
    const baseline = harness.renders;
    act(() => harness.api!.reorderQueue(0, 1));
    expect(harness.renders).toBe(baseline);
  });

  // Same-size-different-membership: a remove + add pair lands at the original
  // queue length, but membership flipped. The Set memo's size pre-check passes,
  // the for-loop hits `!prev.has(ep.id)`, and a fresh Set is allocated. Verifies
  // the third branch of queueEpisodeIdsRef isn't accidentally collapsed into a
  // size-only equality.
  it("re-renders when queue is replaced with same-size different-membership queue", async () => {
    render(<TestTree episode={testEpisode} />);
    await act(async () => harness.api!.playEpisode(unrelatedEpisode));
    await act(async () => harness.api!.addToQueue(secondQueueEpisode));
    const baseline = harness.renders;
    act(() => {
      harness.api!.removeFromQueue(secondQueueEpisode.id);
      harness.api!.addToQueue(testEpisode);
    });
    expect(harness.renders).toBeGreaterThan(baseline);
  });

  it("re-renders when its episode is added to the queue", async () => {
    render(<TestTree episode={testEpisode} />);
    // Play something else first so addToQueue dispatches ADD_TO_QUEUE rather
    // than falling back to playEpisode (the provider skips queuing when nothing
    // is loaded). Also moves past the NowPlayingEpisodeId change before baseline.
    await act(async () => harness.api!.playEpisode(unrelatedEpisode));
    const baseline = harness.renders;
    act(() => harness.api!.addToQueue(testEpisode));
    expect(harness.renders).toBeGreaterThan(baseline);
  });
});
