import { asPodcastIndexEpisodeId } from "@/types/ids";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PlayerBar } from "./player-bar";
import { audioPlayerContextDecorator } from "@/test/story-fixtures";

const testEpisode = {
  id: asPodcastIndexEpisodeId("ep-1"),
  title: "How to Build Better Products",
  podcastTitle: "Design Matters",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://picsum.photos/seed/podcast/300/300",
  duration: 2400,
};

const longTitleEpisode = {
  id: asPodcastIndexEpisodeId("ep-2"),
  title:
    "The Extremely Long Episode Title That Should Be Truncated Because It Exceeds The Available Width In The Player Bar Component",
  podcastTitle: "My Very Long Podcast Name That Also Needs Truncation",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://picsum.photos/seed/podcast2/300/300",
  duration: 5400,
};

const meta: Meta<typeof PlayerBar> = {
  title: "AudioPlayer/PlayerBar",
  component: PlayerBar,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="min-h-[200px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PlayerBar>;

export const Hidden: Story = {
  decorators: [audioPlayerContextDecorator()],
};

export const Playing: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
        currentEpisode: testEpisode,
        isPlaying: true,
        isVisible: true,
        duration: 2400,
      },
      progress: { currentTime: 340, buffered: 800 },
    }),
  ],
};

export const Paused: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
        currentEpisode: testEpisode,
        isVisible: true,
        duration: 2400,
      },
      progress: { currentTime: 340, buffered: 800 },
    }),
  ],
};

export const LongTitle: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
        currentEpisode: longTitleEpisode,
        isPlaying: true,
        isVisible: true,
        duration: 5400,
      },
      progress: { currentTime: 1200, buffered: 2000 },
    }),
  ],
};

export const Buffering: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
        currentEpisode: testEpisode,
        isPlaying: true,
        isBuffering: true,
        isVisible: true,
        duration: 2400,
      },
      progress: { currentTime: 45, buffered: 50 },
    }),
  ],
};

export const WithQueue: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
        currentEpisode: testEpisode,
        isPlaying: true,
        isVisible: true,
        duration: 2400,
        queue: [
          {
            id: asPodcastIndexEpisodeId("ep-3"),
            title: "The Future of Web Development",
            podcastTitle: "Frontend First",
            audioUrl: "https://example.com/audio3.mp3",
            artwork: "https://picsum.photos/seed/podcast3/300/300",
            duration: 1800,
          },
          {
            id: asPodcastIndexEpisodeId("ep-4"),
            title: "Understanding TypeScript Generics",
            podcastTitle: "TypeScript Weekly",
            audioUrl: "https://example.com/audio4.mp3",
            artwork: "https://picsum.photos/seed/podcast4/300/300",
            duration: 3600,
          },
        ],
      },
      progress: { currentTime: 340, buffered: 800 },
    }),
  ],
};

export const MobileViewport: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    chromatic: { viewports: [375] },
  },
  decorators: [
    audioPlayerContextDecorator({
      state: {
        currentEpisode: testEpisode,
        isPlaying: true,
        isVisible: true,
        duration: 2400,
      },
      progress: { currentTime: 340, buffered: 800 },
    }),
  ],
};

const sampleChapters = [
  { startTime: 0, title: "Introduction" },
  { startTime: 300, title: "Guest Interview" },
  { startTime: 900, title: "Deep Dive" },
  { startTime: 1800, title: "Q&A" },
];

export const WithChapters: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
        currentEpisode: testEpisode,
        isPlaying: true,
        isVisible: true,
        duration: 2400,
        chapters: sampleChapters,
      },
      progress: { currentTime: 600, buffered: 900 },
    }),
  ],
};

export const WithoutChapters: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
        currentEpisode: testEpisode,
        isPlaying: true,
        isVisible: true,
        duration: 2400,
      },
      progress: { currentTime: 340, buffered: 800 },
    }),
  ],
};

export const ChaptersLoading: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
        currentEpisode: testEpisode,
        isPlaying: true,
        isVisible: true,
        duration: 2400,
        chaptersLoading: true,
      },
      progress: { currentTime: 340, buffered: 800 },
    }),
  ],
};
