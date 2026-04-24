import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerAPI,
  type AudioEpisode,
} from "@/contexts/audio-player-context";
import { PlayEpisodeButton } from "@/components/audio-player/play-episode-button";

const testEpisode: AudioEpisode = {
  id: "ep-1",
  title: "How to Build Better Products",
  podcastTitle: "Design Matters",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://picsum.photos/seed/podcast/300/300",
  duration: 2400,
};

const otherEpisode: AudioEpisode = {
  id: "ep-2",
  title: "A Different Episode",
  podcastTitle: "Other Podcast",
  audioUrl: "https://example.com/other.mp3",
  duration: 1800,
};

const noopAPI: AudioPlayerAPI = {
  playEpisode: () => {},
  togglePlay: () => {},
  seek: () => {},
  skipForward: () => {},
  skipBack: () => {},
  setVolume: () => {},
  setPlaybackSpeed: () => {},
  closePlayer: () => {},
  addToQueue: () => {},
  removeFromQueue: () => {},
  reorderQueue: () => {},
  clearQueue: () => {},
  playNext: () => {},
  setSleepTimer: () => {},
  cancelSleepTimer: () => {},
  getCurrentTime: () => 0,
};

const baseState: AudioPlayerState = {
  currentEpisode: null,
  isPlaying: false,
  isBuffering: false,
  isVisible: false,
  duration: 0,
  volume: 1,
  playbackSpeed: 1,
  hasError: false,
  errorMessage: null,
  queue: [],
  chapters: null,
  chaptersLoading: false,
  sleepTimer: null,
};

function MockProvider({
  state,
  children,
}: {
  state: AudioPlayerState;
  children: ReactNode;
}) {
  return (
    <AudioPlayerAPIContext.Provider value={noopAPI}>
      <AudioPlayerStateContext.Provider value={state}>
        <AudioPlayerProgressContext.Provider
          value={{ currentTime: 0, buffered: 0 }}
        >
          {children}
        </AudioPlayerProgressContext.Provider>
      </AudioPlayerStateContext.Provider>
    </AudioPlayerAPIContext.Provider>
  );
}

const meta: Meta<typeof PlayEpisodeButton> = {
  title: "AudioPlayer/PlayEpisodeButton",
  component: PlayEpisodeButton,
};

export default meta;
type Story = StoryObj<typeof PlayEpisodeButton>;

export const Default: Story = {
  args: { episode: testEpisode },
  decorators: [
    (Story) => (
      <MockProvider state={baseState}>
        <Story />
      </MockProvider>
    ),
  ],
};

export const NowPlaying: Story = {
  args: { episode: testEpisode },
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, currentEpisode: testEpisode }}>
        <Story />
      </MockProvider>
    ),
  ],
};

export const DifferentEpisodePlaying: Story = {
  args: { episode: testEpisode },
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, currentEpisode: otherEpisode }}>
        <Story />
      </MockProvider>
    ),
  ],
};
