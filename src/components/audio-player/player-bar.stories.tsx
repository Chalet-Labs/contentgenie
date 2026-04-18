import type { Meta, StoryObj } from "@storybook/nextjs-vite"
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
  addToQueue: () => {},
  removeFromQueue: () => {},
  reorderQueue: () => {},
  clearQueue: () => {},
  playNext: () => {},
  setSleepTimer: () => {},
  cancelSleepTimer: () => {},
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
  queue: [],
  chapters: null,
  chaptersLoading: false,
  sleepTimer: null,
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

export const WithQueue: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          currentEpisode: testEpisode,
          isPlaying: true,
          isVisible: true,
          duration: 2400,
          queue: [
            {
              id: "ep-3",
              title: "The Future of Web Development",
              podcastTitle: "Frontend First",
              audioUrl: "https://example.com/audio3.mp3",
              artwork: "https://picsum.photos/seed/podcast3/300/300",
              duration: 1800,
            },
            {
              id: "ep-4",
              title: "Understanding TypeScript Generics",
              podcastTitle: "TypeScript Weekly",
              audioUrl: "https://example.com/audio4.mp3",
              artwork: "https://picsum.photos/seed/podcast4/300/300",
              duration: 3600,
            },
          ],
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

const sampleChapters = [
  { startTime: 0, title: "Introduction" },
  { startTime: 300, title: "Guest Interview" },
  { startTime: 900, title: "Deep Dive" },
  { startTime: 1800, title: "Q&A" },
]

export const WithChapters: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          currentEpisode: testEpisode,
          isPlaying: true,
          isVisible: true,
          duration: 2400,
          chapters: sampleChapters,
          chaptersLoading: false,
        }}
        progress={{ currentTime: 600, buffered: 900 }}
      >
        <div className="min-h-[200px]">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const WithoutChapters: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          currentEpisode: testEpisode,
          isPlaying: true,
          isVisible: true,
          duration: 2400,
          chapters: null,
          chaptersLoading: false,
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

export const ChaptersLoading: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          currentEpisode: testEpisode,
          isPlaying: true,
          isVisible: true,
          duration: 2400,
          chapters: null,
          chaptersLoading: true,
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
