import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import type { ReactNode } from "react"
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerAPI,
  type AudioEpisode,
} from "@/contexts/audio-player-context"
import { AddToQueueButton } from "@/components/audio-player/add-to-queue-button"

const testEpisode: AudioEpisode = {
  id: "ep-1",
  title: "How to Build Better Products",
  podcastTitle: "Design Matters",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://picsum.photos/seed/podcast/300/300",
  duration: 2400,
}

const playingEpisode: AudioEpisode = {
  id: "ep-playing",
  title: "Currently Playing Episode",
  podcastTitle: "Some Podcast",
  audioUrl: "https://example.com/playing.mp3",
  duration: 1800,
}

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
  currentEpisode: playingEpisode,
  isPlaying: true,
  isBuffering: false,
  isVisible: true,
  duration: 1800,
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

const meta: Meta<typeof AddToQueueButton> = {
  title: "AudioPlayer/AddToQueueButton",
  component: AddToQueueButton,
}

export default meta
type Story = StoryObj<typeof AddToQueueButton>

export const Default: Story = {
  args: {
    episode: testEpisode,
    variant: "full",
  },
  decorators: [
    (Story) => (
      <MockProvider state={baseState}>
        <Story />
      </MockProvider>
    ),
  ],
}

export const IconVariant: Story = {
  args: {
    episode: testEpisode,
    variant: "icon",
  },
  decorators: [
    (Story) => (
      <MockProvider state={baseState}>
        <Story />
      </MockProvider>
    ),
  ],
}

export const AlreadyInQueue: Story = {
  args: {
    episode: testEpisode,
    variant: "full",
  },
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, queue: [testEpisode] }}>
        <Story />
      </MockProvider>
    ),
  ],
}

export const NowPlaying: Story = {
  args: {
    episode: playingEpisode,
    variant: "full",
  },
  decorators: [
    (Story) => (
      <MockProvider state={baseState}>
        <Story />
      </MockProvider>
    ),
  ],
}
