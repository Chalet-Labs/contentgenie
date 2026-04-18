import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import type { ReactNode } from "react"
import { ListMusic } from "lucide-react"
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerAPI,
  type AudioEpisode,
} from "@/contexts/audio-player-context"
import { Button } from "@/components/ui/button"
import { QueuePanel } from "@/components/audio-player/queue-panel"

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

const playingEpisode: AudioEpisode = {
  id: "ep-playing",
  title: "Currently Playing Episode",
  podcastTitle: "Some Podcast",
  audioUrl: "https://example.com/playing.mp3",
  duration: 1800,
}

const queueEpisodes: AudioEpisode[] = [
  {
    id: "ep-1",
    title: "How to Build Better Products",
    podcastTitle: "Design Matters",
    audioUrl: "https://example.com/audio1.mp3",
    artwork: "https://picsum.photos/seed/podcast1/300/300",
    duration: 2400,
  },
  {
    id: "ep-2",
    title: "The Future of AI in Healthcare",
    podcastTitle: "Tech Talk Daily",
    audioUrl: "https://example.com/audio2.mp3",
    artwork: "https://picsum.photos/seed/podcast2/300/300",
    duration: 3600,
  },
  {
    id: "ep-3",
    title:
      "An Extremely Long Title That Should Be Truncated In The Queue Panel",
    podcastTitle: "Conversations With Very Long Podcast Names",
    audioUrl: "https://example.com/audio3.mp3",
    duration: 1200,
  },
]

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

const queueTrigger = (
  <Button variant="ghost" size="icon" aria-label="Queue">
    <ListMusic className="h-4 w-4" />
  </Button>
)

const meta: Meta<typeof QueuePanel> = {
  title: "AudioPlayer/QueuePanel",
  component: QueuePanel,
}

export default meta
type Story = StoryObj<typeof QueuePanel>

export const EmptyQueue: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    trigger: queueTrigger,
  },
  decorators: [
    (Story) => (
      <MockProvider state={baseState}>
        <div className="flex min-h-[400px] items-end justify-end p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const MultipleItems: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    trigger: queueTrigger,
  },
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, queue: queueEpisodes }}>
        <div className="flex min-h-[400px] items-end justify-end p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const SingleItem: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    trigger: queueTrigger,
  },
  decorators: [
    (Story) => (
      <MockProvider
        state={{ ...baseState, queue: [queueEpisodes[0]] }}
      >
        <div className="flex min-h-[400px] items-end justify-end p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const LongTitles: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    trigger: queueTrigger,
  },
  decorators: [
    (Story) => (
      <MockProvider
        state={{
          ...baseState,
          queue: [
            {
              id: "ep-long-1",
              title:
                "An Episode With An Extremely Long Title That Will Definitely Overflow And Need Truncation In The Queue Panel List",
              podcastTitle:
                "A Podcast With An Equally Long And Verbose Name That Also Needs Truncation",
              audioUrl: "https://example.com/audio-long-1.mp3",
              duration: 4500,
            },
            {
              id: "ep-long-2",
              title:
                "Another Very Long Episode Title: Deep Dive Into The Minutiae Of Something Extremely Complicated And Verbose",
              podcastTitle: "The Long-Winded Podcast",
              audioUrl: "https://example.com/audio-long-2.mp3",
              artwork: "https://picsum.photos/seed/podcast5/300/300",
              duration: 3300,
            },
          ],
        }}
      >
        <div className="flex min-h-[400px] items-end justify-end p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const MobileSheet: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    chromatic: { viewports: [375] },
  },
  args: {
    open: true,
    onOpenChange: () => {},
    trigger: queueTrigger,
  },
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, queue: queueEpisodes }}>
        <div className="min-h-[400px]">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}
