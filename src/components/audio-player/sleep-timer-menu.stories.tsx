import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import type { ReactNode } from "react"
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context"
import { SleepTimerMenu } from "@/components/audio-player/sleep-timer-menu"
import { STORY_NOW } from "@/test/story-fixtures"

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

function withMockedLayout(state: AudioPlayerState) {
  return function MockedLayout(Story: () => ReactNode) {
    return (
      <MockProvider state={state}>
        <div className="flex items-end justify-end p-4" style={{ minHeight: 400 }}>
          <Story />
        </div>
      </MockProvider>
    )
  }
}

export const Default: Story = {
  decorators: [withMockedLayout(baseState)],
}

export const ActiveDurationTimer: Story = {
  name: "Active Duration Timer (25:30 remaining)",
  decorators: [
    withMockedLayout({
      ...baseState,
      sleepTimer: {
        endTime: new Date(STORY_NOW.getTime() + 25 * 60_000 + 30_000).getTime(),
        type: "duration",
      },
    }),
  ],
}

export const ActiveEndOfEpisode: Story = {
  name: "Active End-of-Episode Timer",
  decorators: [
    withMockedLayout({
      ...baseState,
      sleepTimer: {
        endTime: null,
        type: "end-of-episode",
      },
    }),
  ],
}
