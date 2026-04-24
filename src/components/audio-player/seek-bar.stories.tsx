import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerProgress,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context";
import { SeekBar } from "./seek-bar";

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
  progress,
  children,
}: {
  state: AudioPlayerState;
  progress: AudioPlayerProgress;
  children: ReactNode;
}) {
  return (
    <AudioPlayerAPIContext.Provider value={noopAPI}>
      <AudioPlayerStateContext.Provider value={state}>
        <AudioPlayerProgressContext.Provider value={progress}>
          {children}
        </AudioPlayerProgressContext.Provider>
      </AudioPlayerStateContext.Provider>
    </AudioPlayerAPIContext.Provider>
  );
}

const meta: Meta<typeof SeekBar> = {
  title: "AudioPlayer/SeekBar",
  component: SeekBar,
};

export default meta;
type Story = StoryObj<typeof SeekBar>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{ ...baseState, duration: 300 }}
        progress={{ currentTime: 45, buffered: 120 }}
      >
        <div className="mx-auto max-w-lg p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const NearEnd: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{ ...baseState, duration: 300 }}
        progress={{ currentTime: 285, buffered: 300 }}
      >
        <div className="mx-auto max-w-lg p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const LongEpisode: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{ ...baseState, duration: 7200 }}
        progress={{ currentTime: 3600, buffered: 4500 }}
      >
        <div className="mx-auto max-w-lg p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const BufferedRange: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{ ...baseState, duration: 600 }}
        progress={{ currentTime: 30, buffered: 450 }}
      >
        <div className="mx-auto max-w-lg p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const ZeroDuration: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{ ...baseState, duration: 0 }}
        progress={{ currentTime: 0, buffered: 0 }}
      >
        <div className="mx-auto max-w-lg p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const WithChapterMarkers: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          duration: 3600,
          chapters: [
            { startTime: 0, title: "Introduction" },
            { startTime: 300, title: "Guest Interview" },
            { startTime: 900, title: "Deep Dive" },
            { startTime: 1800, title: "Q&A" },
            { startTime: 3000, title: "Outro" },
          ],
        }}
        progress={{ currentTime: 600, buffered: 1200 }}
      >
        <div className="mx-auto max-w-lg p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const NoChapterMarkers: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{ ...baseState, duration: 3600, chapters: null }}
        progress={{ currentTime: 600, buffered: 1200 }}
      >
        <div className="mx-auto max-w-lg p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};
