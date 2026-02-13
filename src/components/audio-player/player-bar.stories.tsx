import type { Meta, StoryObj } from "@storybook/react"
import type { ReactNode } from "react"
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerProgress,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context"
import { PlayerBar } from "./player-bar"

const noopAPI: AudioPlayerAPI = {
  playEpisode: () => {},
  togglePlay: () => {},
  seek: () => {},
  skipForward: () => {},
  skipBack: () => {},
  setVolume: () => {},
  setPlaybackSpeed: () => {},
  closePlayer: () => {},
}

const defaultProgress: AudioPlayerProgress = {
  currentTime: 45,
  buffered: 120,
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
}

const testEpisode = {
  id: "ep-1",
  title: "How to Build Better Products",
  podcastTitle: "Design Matters",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://picsum.photos/seed/podcast/300/300",
  duration: 2400,
}

const longTitleEpisode = {
  id: "ep-2",
  title: "The Extremely Long Episode Title That Should Be Truncated Because It Exceeds The Available Width In The Player Bar Component",
  podcastTitle: "My Very Long Podcast Name That Also Needs Truncation",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://picsum.photos/seed/podcast2/300/300",
  duration: 5400,
}

function MockProvider({
  state,
  progress = defaultProgress,
  children,
}: {
  state: AudioPlayerState
  progress?: AudioPlayerProgress
  children: ReactNode
}) {
  return (
    <AudioPlayerAPIContext.Provider value={noopAPI}>
      <AudioPlayerStateContext.Provider value={state}>
        <AudioPlayerProgressContext.Provider value={progress}>
          {children}
        </AudioPlayerProgressContext.Provider>
      </AudioPlayerStateContext.Provider>
    </AudioPlayerAPIContext.Provider>
  )
}

const meta: Meta<typeof PlayerBar> = {
  title: "AudioPlayer/PlayerBar",
  component: PlayerBar,
  parameters: {
    layout: "fullscreen",
  },
}

export default meta
type Story = StoryObj<typeof PlayerBar>

export const Hidden: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={baseState}>
        <div className="min-h-[200px]">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const Playing: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          currentEpisode: testEpisode,
          isPlaying: true,
          isVisible: true,
          duration: 2400,
        }}
        progress={{ currentTime: 340, buffered: 800 }}
      >
        <div className="min-h-[200px]">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const Paused: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          currentEpisode: testEpisode,
          isPlaying: false,
          isVisible: true,
          duration: 2400,
        }}
        progress={{ currentTime: 340, buffered: 800 }}
      >
        <div className="min-h-[200px]">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const LongTitle: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          currentEpisode: longTitleEpisode,
          isPlaying: true,
          isVisible: true,
          duration: 5400,
        }}
        progress={{ currentTime: 1200, buffered: 2000 }}
      >
        <div className="min-h-[200px]">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const Buffering: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          currentEpisode: testEpisode,
          isPlaying: true,
          isBuffering: true,
          isVisible: true,
          duration: 2400,
        }}
        progress={{ currentTime: 45, buffered: 50 }}
      >
        <div className="min-h-[200px]">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const MobileViewport: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    chromatic: { viewports: [375] },
  },
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          currentEpisode: testEpisode,
          isPlaying: true,
          isVisible: true,
          duration: 2400,
        }}
        progress={{ currentTime: 340, buffered: 800 }}
      >
        <div className="min-h-[200px]">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}
