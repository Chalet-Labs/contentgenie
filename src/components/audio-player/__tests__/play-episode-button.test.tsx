import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AudioEpisode } from "@/contexts/audio-player-context";

const mockPlayEpisode = vi.fn();
let mockCurrentEpisode: AudioEpisode | null = null;

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerAPI: () => ({ playEpisode: mockPlayEpisode }),
  useAudioPlayerState: () => ({ currentEpisode: mockCurrentEpisode }),
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
    mockCurrentEpisode = null;
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
    const user = userEvent.setup();
    render(<PlayEpisodeButton episode={episode} />);
    const btn = screen.getByRole("button", { name: /now playing/i });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(mockPlayEpisode).not.toHaveBeenCalled();
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
