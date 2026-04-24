import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AudioEpisode } from "@/contexts/audio-player-context";

const mockPlayEpisode = vi.fn();
const mockTogglePlay = vi.fn();
let mockCurrentEpisode: AudioEpisode | null = null;
let mockIsPlaying = false;

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerAPI: () => ({
    playEpisode: mockPlayEpisode,
    togglePlay: mockTogglePlay,
  }),
  useAudioPlayerState: () => ({
    currentEpisode: mockCurrentEpisode,
    isPlaying: mockIsPlaying,
  }),
}));

// Import after mocks so the component sees the mocked context.
import { PlayEpisodeButton } from "@/components/audio-player/play-episode-button";

const episode: AudioEpisode = {
  id: "ep-42",
  title: "Episode Title",
  podcastTitle: "Podcast",
  audioUrl: "https://example.com/a.mp3",
};

describe("PlayEpisodeButton", () => {
  beforeEach(() => {
    mockPlayEpisode.mockClear();
    mockTogglePlay.mockClear();
    mockCurrentEpisode = null;
    mockIsPlaying = false;
  });

  it("calls playEpisode when clicked", async () => {
    const user = userEvent.setup();
    render(<PlayEpisodeButton episode={episode} />);
    await user.click(screen.getByRole("button", { name: /play episode/i }));
    expect(mockPlayEpisode).toHaveBeenCalledWith(episode);
  });

  it("invokes onBeforePlay before playEpisode, preserving mark-read semantics", async () => {
    const order: string[] = [];
    const onBeforePlay = vi.fn(() => order.push("before"));
    mockPlayEpisode.mockImplementation(() => order.push("play"));
    const user = userEvent.setup();
    render(<PlayEpisodeButton episode={episode} onBeforePlay={onBeforePlay} />);
    await user.click(screen.getByRole("button", { name: /play episode/i }));
    expect(onBeforePlay).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["before", "play"]);
  });

  it("does not call playEpisode when this episode is already playing", async () => {
    mockCurrentEpisode = episode;
    mockIsPlaying = true;
    const user = userEvent.setup();
    render(<PlayEpisodeButton episode={episode} />);
    const btn = screen.getByRole("button", { name: /now playing/i });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(mockPlayEpisode).not.toHaveBeenCalled();
    expect(mockTogglePlay).not.toHaveBeenCalled();
  });

  // Regression: a paused episode is still the "current" one. Users clicked the
  // Play button on the card they came from and got a dead button. Now the
  // button stays enabled when paused and resumes via togglePlay.
  it("stays enabled and calls togglePlay to resume when episode is current but paused", async () => {
    mockCurrentEpisode = episode;
    mockIsPlaying = false;
    const user = userEvent.setup();
    render(<PlayEpisodeButton episode={episode} />);
    const btn = screen.getByRole("button", { name: /resume episode/i });
    expect(btn).not.toBeDisabled();
    await user.click(btn);
    expect(mockTogglePlay).toHaveBeenCalledTimes(1);
    expect(mockPlayEpisode).not.toHaveBeenCalled();
  });

  it("runs onBeforePlay before togglePlay when resuming a paused current episode", async () => {
    mockCurrentEpisode = episode;
    mockIsPlaying = false;
    const order: string[] = [];
    const onBeforePlay = vi.fn(() => order.push("before"));
    mockTogglePlay.mockImplementation(() => order.push("toggle"));
    const user = userEvent.setup();
    render(<PlayEpisodeButton episode={episode} onBeforePlay={onBeforePlay} />);
    await user.click(screen.getByRole("button", { name: /resume episode/i }));
    expect(order).toEqual(["before", "toggle"]);
  });

  it("uses custom aria-label when provided", () => {
    render(
      <PlayEpisodeButton episode={episode} aria-label="Play Test Episode" />,
    );
    expect(
      screen.getByRole("button", { name: "Play Test Episode" }),
    ).toBeInTheDocument();
  });
});
