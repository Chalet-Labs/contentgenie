import { asPodcastIndexEpisodeId } from "@/types/ids";
import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { ChapterList } from "@/components/audio-player/chapter-list";
import type { Chapter } from "@/lib/chapters";
import { audioPlayerContextDecorator } from "@/test/story-fixtures";

const playingState = {
  currentEpisode: {
    id: asPodcastIndexEpisodeId("1"),
    title: "Test Episode",
    podcastTitle: "Test Podcast",
    audioUrl: "https://example.com/audio.mp3",
  },
  isPlaying: true,
  isVisible: true,
  duration: 3600,
};

const cardWrapper: Decorator = (Story) => (
  <div className="w-80 rounded-md border p-3">
    <Story />
  </div>
);

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
  decorators: [cardWrapper],
};

export default meta;
type Story = StoryObj<typeof ChapterList>;

export const Default: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: { ...playingState, chapters: sampleChapters },
      progress: { currentTime: 150, buffered: 0 },
    }),
  ],
};

export const LongList: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: { ...playingState, chapters: longChapters },
      progress: { currentTime: 600, buffered: 0 },
    }),
  ],
};

export const WithThumbnails: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: { ...playingState, chapters: chaptersWithImages },
      progress: { currentTime: 70, buffered: 0 },
    }),
  ],
};

export const EmptyState: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: { ...playingState, chapters: null },
    }),
  ],
};

export const SingleChapter: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
        ...playingState,
        chapters: [{ startTime: 0, title: "Full Episode" }],
      },
      progress: { currentTime: 30, buffered: 0 },
    }),
  ],
};
