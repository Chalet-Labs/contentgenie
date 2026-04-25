import { Profiler, type ProfilerOnRenderCallback } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import {
  AudioPlayerProvider,
  useAudioPlayerAPI,
  type AudioEpisode,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context";
import { PlayEpisodeButton } from "@/components/audio-player/play-episode-button";

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
  id: "ep-render-test",
  title: "Render Count Test Episode",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/audio.mp3",
  duration: 600,
};

// ── Render-count infrastructure ───────────────────────────────────────────────
// React.Profiler measures PlayEpisodeButton's actual renders regardless of how
// it subscribes to contexts. A regression that re-adds useAudioPlayerState()
// will cause setVolume/setPlaybackSpeed/buffering to increment renders and fail
// the isolation tests. Mirror-subscription wrappers cannot catch this because
// the wrapper counter only ticks when the narrow slice contexts change — it
// would remain flat even if PlayEpisodeButton was re-subscribing to the fat
// context and thrashing on every dispatch.

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
      <Profiler id="play-episode-button" onRender={onRender}>
        <PlayEpisodeButton episode={episode} />
      </Profiler>
      <APIBridge />
    </AudioPlayerProvider>
  );
}

describe("PlayEpisodeButton render counts (real AudioPlayerProvider)", () => {
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
  // These must all be green — if any re-renders, the narrow-context optimization
  // isn't working (or a regression re-added a fat-context subscription).

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

  // ── Sanity assertions (verify the button still reacts to its own slices) ───

  it("re-renders when its episode becomes the current episode", async () => {
    render(<TestTree episode={testEpisode} />);
    const baseline = renders;
    await act(async () => capturedAPI!.playEpisode(testEpisode));
    expect(renders).toBeGreaterThan(baseline);
  });

  it("re-renders when isPlaying toggles for its current episode", async () => {
    render(<TestTree episode={testEpisode} />);
    await act(async () => capturedAPI!.playEpisode(testEpisode));
    const afterPlay = renders;
    // jsdom doesn't auto-fire audio events when audio.pause() is called, so
    // the provider's onPause handler (which dispatches SET_PLAYING:false) won't
    // run via togglePlay(). Fire the 'pause' event manually — same pattern as
    // the existing audio-player-context.test.tsx (fireAudioEvent helper).
    act(() => {
      const audio = document.querySelector("audio");
      audio?.dispatchEvent(new Event("pause"));
    });
    expect(renders).toBeGreaterThan(afterPlay);
  });
});
