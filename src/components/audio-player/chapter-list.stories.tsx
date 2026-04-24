import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context";
import { ChapterList } from "@/components/audio-player/chapter-list";
import type { Chapter } from "@/lib/chapters";

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

function makeState(chapters: Chapter[] | null): AudioPlayerState {
  return {
    currentEpisode: {
      id: "1",
      title: "Test Episode",
      podcastTitle: "Test Podcast",
      audioUrl: "https://example.com/audio.mp3",
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
    chapters,
    chaptersLoading: false,
    sleepTimer: null,
  };
}

function MockProvider({
  state,
  currentTime,
  children,
}: {
  state: AudioPlayerState;
  currentTime: number;
  children: ReactNode;
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
  );
}

const sampleChapters: Chapter[] = [
  { startTime: 0, title: "Introduction" },
  { startTime: 45, title: "Sponsor Message" },
  { startTime: 120, title: "Interview Part 1" },
  { startTime: 600, title: "Interview Part 2" },
  { startTime: 1800, title: "Listener Questions" },
  { startTime: 2400, title: "Outro" },
];

const longChapters: Chapter[] = Array.from({ length: 25 }, (_, i) => ({
  startTime: i * 120,
  title: `Chapter ${i + 1}: ${["Deep Dive", "Analysis", "Discussion", "Review", "Summary"][i % 5]}`,
}));

const chaptersWithImages: Chapter[] = [
  {
    startTime: 0,
    title: "Cold Open",
    img: "https://picsum.photos/seed/ch1/64/64",
  },
  {
    startTime: 60,
    title: "Main Topic",
    img: "https://picsum.photos/seed/ch2/64/64",
  },
  {
    startTime: 300,
    title: "Guest Segment",
    img: "https://picsum.photos/seed/ch3/64/64",
  },
];

const meta: Meta<typeof ChapterList> = {
  title: "AudioPlayer/ChapterList",
  component: ChapterList,
};

export default meta;
type Story = StoryObj<typeof ChapterList>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={makeState(sampleChapters)} currentTime={150}>
        <div className="w-80 rounded-md border p-3">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const LongList: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={makeState(longChapters)} currentTime={600}>
        <div className="w-80 rounded-md border p-3">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const WithThumbnails: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={makeState(chaptersWithImages)} currentTime={70}>
        <div className="w-80 rounded-md border p-3">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const EmptyState: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={makeState(null)} currentTime={0}>
        <div className="w-80 rounded-md border p-3">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const SingleChapter: Story = {
  decorators: [
    (Story) => (
      <MockProvider
        state={makeState([{ startTime: 0, title: "Full Episode" }])}
        currentTime={30}
      >
        <div className="w-80 rounded-md border p-3">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};
