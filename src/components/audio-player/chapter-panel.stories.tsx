import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { BookMarked } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChapterPanel } from "@/components/audio-player/chapter-panel";
import type { Chapter } from "@/lib/chapters";
import { audioPlayerContextDecorator } from "@/test/story-fixtures";

const sampleChapters: Chapter[] = [
  { startTime: 0, title: "Introduction" },
  { startTime: 45, title: "Sponsor Message" },
  { startTime: 120, title: "Interview Part 1" },
  { startTime: 600, title: "Interview Part 2" },
  { startTime: 1800, title: "Listener Questions" },
  { startTime: 2400, title: "Outro" },
];

const playingState = {
  currentEpisode: {
    id: "1",
    title: "Test Episode",
    podcastTitle: "Test Podcast",
    audioUrl: "https://example.com/audio.mp3",
  },
  isPlaying: true,
  isVisible: true,
  duration: 3600,
  chapters: sampleChapters,
};

const chapterTrigger = (
  <Button variant="ghost" size="icon" aria-label="Chapters">
    <BookMarked className="h-4 w-4" />
  </Button>
);

const baseArgs = {
  open: true,
  onOpenChange: () => {},
  trigger: chapterTrigger,
};

const popoverWrapper: Decorator = (Story) => (
  <div className="flex min-h-[400px] items-end justify-end p-4">
    <Story />
  </div>
);

const sheetWrapper: Decorator = (Story) => (
  <div className="min-h-[400px]">
    <Story />
  </div>
);

const meta: Meta<typeof ChapterPanel> = {
  title: "AudioPlayer/ChapterPanel",
  component: ChapterPanel,
};

export default meta;
type Story = StoryObj<typeof ChapterPanel>;

export const DesktopPopover: Story = {
  args: baseArgs,
  decorators: [
    audioPlayerContextDecorator({
      state: playingState,
      progress: { currentTime: 150, buffered: 0 },
    }),
    popoverWrapper,
  ],
};

export const MobileSheet: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    chromatic: { viewports: [375] },
  },
  args: baseArgs,
  decorators: [
    audioPlayerContextDecorator({
      state: playingState,
      progress: { currentTime: 150, buffered: 0 },
    }),
    sheetWrapper,
  ],
};
