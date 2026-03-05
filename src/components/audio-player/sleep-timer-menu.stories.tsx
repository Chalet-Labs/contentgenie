import type { Meta, StoryObj } from "@storybook/react"
import type { ReactNode } from "react"
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context"
import { SleepTimerMenu } from "./sleep-timer-menu"

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
}

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
}

function MockProvider({
  state,
  children,
}: {
  state: AudioPlayerState
  children: ReactNode
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
  )
}

const meta: Meta<typeof SleepTimerMenu> = {
  title: "AudioPlayer/SleepTimerMenu",
  component: SleepTimerMenu,
}

export default meta
type Story = StoryObj<typeof SleepTimerMenu>

export const Default: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={baseState}>
        <div className="flex items-end justify-end p-4" style={{ minHeight: 400 }}>
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const ActiveDurationTimer: Story = {
  name: "Active Duration Timer (25:30 remaining)",
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          sleepTimer: {
            endTime: Date.now() + 1530_000,
            type: "duration",
          },
        }}
      >
        <div className="flex items-end justify-end p-4" style={{ minHeight: 400 }}>
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const ActiveEndOfEpisode: Story = {
  name: "Active End-of-Episode Timer",
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          sleepTimer: {
            endTime: null,
            type: "end-of-episode",
          },
        }}
      >
        <div className="flex items-end justify-end p-4" style={{ minHeight: 400 }}>
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}
