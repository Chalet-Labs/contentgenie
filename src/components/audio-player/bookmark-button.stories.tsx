import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import type { ReactNode } from "react"
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context"
import { BookmarkButton } from "@/components/audio-player/bookmark-button"

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
}

const baseState: AudioPlayerState = {
  currentEpisode: {
    id: "ep-123",
    title: "Test Episode",
    podcastTitle: "Test Podcast",
    audioUrl: "http://example.com/audio.mp3",
    artwork: undefined,
    duration: 3600,
  },
  isPlaying: true,
  isBuffering: false,
  isVisible: true,
  duration: 3600,
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
  currentTime = 125,
  children,
}: {
  state: AudioPlayerState
  currentTime?: number
  children: ReactNode
}) {
  return (
    <AudioPlayerAPIContext.Provider value={noopAPI}>
      <AudioPlayerStateContext.Provider value={state}>
        <AudioPlayerProgressContext.Provider
          value={{ currentTime, buffered: 0 }}
        >
          {children}
        </AudioPlayerProgressContext.Provider>
      </AudioPlayerStateContext.Provider>
    </AudioPlayerAPIContext.Provider>
  )
}

const meta: Meta<typeof BookmarkButton> = {
  title: "AudioPlayer/BookmarkButton",
  component: BookmarkButton,
}

export default meta
type Story = StoryObj<typeof BookmarkButton>

function withMockedLayout(state: AudioPlayerState) {
  return function MockedLayout(Story: () => ReactNode) {
    return (
      <MockProvider state={state}>
        <div className="flex items-end justify-center p-4" style={{ minHeight: 200 }}>
          <Story />
        </div>
      </MockProvider>
    )
  }
}

export const Default: Story = {
  name: "Default (Episode in Library)",
  decorators: [withMockedLayout(baseState)],
}

export const NoEpisode: Story = {
  name: "No Episode Loaded (Hidden)",
  decorators: [withMockedLayout({ ...baseState, currentEpisode: null })],
}
