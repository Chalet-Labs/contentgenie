import { Profiler } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  AudioPlayerProvider,
  type AudioEpisode,
} from "@/contexts/audio-player-context";
import { PlayEpisodeButton } from "@/components/audio-player/play-episode-button";
import {
  createRenderCountHarness,
  stubHTMLMediaElement,
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
  id: "ep-render-test",
  title: "Render Count Test Episode",
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

// React.Profiler measures PlayEpisodeButton's actual renders regardless of how
// it subscribes to contexts. A regression that re-adds useAudioPlayerState()
// will cause setVolume/setPlaybackSpeed/buffering to increment renders and fail
// the isolation tests. Mirror-subscription wrappers cannot catch this because
// the wrapper counter only ticks when the narrow slice contexts change.
const harness = createRenderCountHarness();

function TestTree({ episode }: { episode: AudioEpisode }) {
  return (
    <AudioPlayerProvider>
      <Profiler id="play-episode-button" onRender={harness.onRender}>
        <PlayEpisodeButton episode={episode} />
      </Profiler>
      <harness.APIBridge />
    </AudioPlayerProvider>
  );
}

describe("PlayEpisodeButton render counts (real AudioPlayerProvider)", () => {
  beforeEach(() => {
    harness.reset();
    stubHTMLMediaElement();
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

  it("re-renders when its episode becomes the current episode", async () => {
    render(<TestTree episode={testEpisode} />);
    const baseline = harness.renders;
    await act(async () => harness.api!.playEpisode(testEpisode));
    expect(harness.renders).toBeGreaterThan(baseline);
  });

  // useIsEpisodePlaying must scope to its episodeId argument. A regression that
  // dropped the `nowPlayingId === episodeId` comparison would make every
  // PlayEpisodeButton flash "Now playing" while the player plays any episode.
  it("does not show 'Now playing' when an unrelated episode is playing", async () => {
    render(<TestTree episode={testEpisode} />);
    await act(async () => harness.api!.playEpisode(unrelatedEpisode));
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "Play episode");
    expect(button).not.toHaveAttribute("aria-disabled", "true");
  });

  it("re-renders when isPlaying toggles for its current episode", async () => {
    render(<TestTree episode={testEpisode} />);
    await act(async () => harness.api!.playEpisode(testEpisode));
    const afterPlay = harness.renders;
    // jsdom doesn't auto-fire audio events when audio.pause() is called, so
    // the provider's onPause handler (SET_PLAYING:false) won't run via
    // togglePlay(). Fire the 'pause' event manually.
    act(() => {
      const audio = document.querySelector("audio");
      audio?.dispatchEvent(new Event("pause"));
    });
    expect(harness.renders).toBeGreaterThan(afterPlay);
  });
});
