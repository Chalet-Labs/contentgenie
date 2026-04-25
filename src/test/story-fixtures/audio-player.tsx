import type { Decorator } from "@storybook/nextjs-vite";
import {
  AudioPlayerAPIContext,
  AudioPlayerProgressContext,
  AudioPlayerStateContext,
  type AudioPlayerAPI,
  type AudioPlayerProgress,
  type AudioPlayerState,
} from "@/contexts/audio-player-context";

export const noopAudioPlayerAPI: AudioPlayerAPI = {
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

export const idleAudioPlayerState: AudioPlayerState = {
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

export const idleAudioPlayerProgress: AudioPlayerProgress = {
  currentTime: 0,
  buffered: 0,
};

type AudioPlayerContextOverrides = {
  api?: Partial<AudioPlayerAPI>;
  state?: Partial<AudioPlayerState>;
  progress?: Partial<AudioPlayerProgress>;
};

export function audioPlayerContextDecorator(
  overrides: AudioPlayerContextOverrides = {},
): Decorator {
  const api = { ...noopAudioPlayerAPI, ...overrides.api };
  const state = { ...idleAudioPlayerState, ...overrides.state };
  const progress = { ...idleAudioPlayerProgress, ...overrides.progress };

  const AudioPlayerContextDecorator: Decorator = (Story) => (
    <AudioPlayerAPIContext.Provider value={api}>
      <AudioPlayerStateContext.Provider value={state}>
        <AudioPlayerProgressContext.Provider value={progress}>
          <Story />
        </AudioPlayerProgressContext.Provider>
      </AudioPlayerStateContext.Provider>
    </AudioPlayerAPIContext.Provider>
  );
  return AudioPlayerContextDecorator;
}

export const withAudioPlayerContext = audioPlayerContextDecorator();

export const popoverPanelWrapper: Decorator = (Story) => (
  <div className="flex min-h-[400px] items-end justify-end p-4">
    <Story />
  </div>
);

export const sheetPanelWrapper: Decorator = (Story) => (
  <div className="min-h-[400px]">
    <Story />
  </div>
);
