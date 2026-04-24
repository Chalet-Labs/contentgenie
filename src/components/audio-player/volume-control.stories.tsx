import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context";
import { VolumeControl } from "@/components/audio-player/volume-control";

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

const meta: Meta<typeof VolumeControl> = {
  title: "AudioPlayer/VolumeControl",
  component: VolumeControl,
};

export default meta;
type Story = StoryObj<typeof VolumeControl>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, volume: 1 }}>
        <div className="p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const Muted: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, volume: 0 }}>
        <div className="p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const HalfVolume: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, volume: 0.5 }}>
        <div className="p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const MaxVolume: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, volume: 1 }}>
        <div className="p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};
