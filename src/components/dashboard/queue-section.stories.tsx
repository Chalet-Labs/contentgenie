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
import { QueueSection } from "@/components/dashboard/queue-section"

// ---------------------------------------------------------------------------
// Mock provider — same pattern as queue-panel.stories.tsx
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const nowPlayingEpisode: AudioEpisode = {
  id: "2001",
  title: "The Future of AI in Healthcare",
  podcastTitle: "Tech Talk Daily",
  audioUrl: "https://example.com/playing.mp3",
  artwork: "https://picsum.photos/seed/podcast1/300/300",
  duration: 3600,
}

const queueEpisodes: AudioEpisode[] = [
  {
    id: "1001",
    title: "How to Build Better Products",
    podcastTitle: "Design Matters",
    audioUrl: "https://example.com/audio1.mp3",
    artwork: "https://picsum.photos/seed/podcast2/300/300",
    duration: 2400,
  },
  {
    id: "1002",
    title: "Leadership in the Age of Remote Work",
    podcastTitle: "The Management Lab",
    audioUrl: "https://example.com/audio2.mp3",
    artwork: "https://picsum.photos/seed/podcast3/300/300",
    duration: 1800,
  },
  {
    id: "1003",
    title: "An Extremely Long Episode Title That Should Be Truncated When Displayed Inside the Queue Section Card Component",
    podcastTitle: "The Very Verbose and Long-Winded Podcast About Everything",
    audioUrl: "https://example.com/audio3.mp3",
    duration: 1200,
  },
]

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof QueueSection> = {
  title: "Dashboard/QueueSection",
  component: QueueSection,
  parameters: {
    layout: "padded",
  },
}

export default meta
type Story = StoryObj<typeof QueueSection>

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const EmptyState: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={baseState}>
        <div className="max-w-2xl">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const NowPlayingOnly: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{ ...baseState, currentEpisode: nowPlayingEpisode, isPlaying: true }}
      >
        <div className="max-w-2xl">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const QueueWithoutCurrentEpisode: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, queue: queueEpisodes }}>
        <div className="max-w-2xl">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const NowPlayingWithQueue: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          currentEpisode: nowPlayingEpisode,
          isPlaying: true,
          queue: queueEpisodes,
        }}
      >
        <div className="max-w-2xl">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const SingleQueueItem: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, queue: [queueEpisodes[0]] }}>
        <div className="max-w-2xl">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const LongTitles: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          currentEpisode: {
            id: "long-0",
            title: "An Episode With An Extremely Long Title That Will Definitely Overflow And Need Truncation In The Queue Section On The Dashboard Page",
            podcastTitle: "A Podcast With An Equally Long And Verbose Name That Also Needs Truncation To Fit",
            audioUrl: "https://example.com/audio-long-0.mp3",
          },
          queue: [queueEpisodes[2]],
        }}
      >
        <div className="max-w-2xl">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const NoArtwork: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          currentEpisode: {
            id: "2001",
            title: "Episode Without Artwork",
            podcastTitle: "Text-only Podcast",
            audioUrl: "https://example.com/audio.mp3",
          },
          queue: [
            {
              id: "1001",
              title: "Another Episode Without Artwork",
              podcastTitle: "Also No Artwork",
              audioUrl: "https://example.com/audio2.mp3",
            },
          ],
        }}
      >
        <div className="max-w-2xl">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}
