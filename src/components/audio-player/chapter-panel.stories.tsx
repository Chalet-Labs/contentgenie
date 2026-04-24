import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { BookMarked } from "lucide-react";
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context";
import { Button } from "@/components/ui/button";
import { ChapterPanel } from "@/components/audio-player/chapter-panel";
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

const sampleChapters: Chapter[] = [
  { startTime: 0, title: "Introduction" },
  { startTime: 45, title: "Sponsor Message" },
  { startTime: 120, title: "Interview Part 1" },
  { startTime: 600, title: "Interview Part 2" },
  { startTime: 1800, title: "Listener Questions" },
  { startTime: 2400, title: "Outro" },
];

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

const chapterTrigger = (
  <Button variant="ghost" size="icon" aria-label="Chapters">
    <BookMarked className="h-4 w-4" />
  </Button>
);

const meta: Meta<typeof ChapterPanel> = {
  title: "AudioPlayer/ChapterPanel",
  component: ChapterPanel,
};

export default meta;
type Story = StoryObj<typeof ChapterPanel>;

export const DesktopPopover: Story = {
  args: {
    open: true,
    onOpenChange: () => {},
    trigger: chapterTrigger,
  },
  decorators: [
    (Story) => (
      <MockProvider state={makeState(sampleChapters)} currentTime={150}>
        <div className="flex min-h-[400px] items-end justify-end p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};

export const MobileSheet: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    chromatic: { viewports: [375] },
  },
  args: {
    open: true,
    onOpenChange: () => {},
    trigger: chapterTrigger,
  },
  decorators: [
    (Story) => (
      <MockProvider state={makeState(sampleChapters)} currentTime={150}>
        <div className="min-h-[400px]">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
};
