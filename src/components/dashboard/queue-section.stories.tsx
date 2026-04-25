import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { type AudioEpisode } from "@/contexts/audio-player-context";
import { QueueSection } from "@/components/dashboard/queue-section";
import { audioPlayerContextDecorator } from "@/test/story-fixtures";

const nowPlayingEpisode: AudioEpisode = {
  id: "2001",
  title: "The Future of AI in Healthcare",
  podcastTitle: "Tech Talk Daily",
  audioUrl: "https://example.com/playing.mp3",
  artwork: "https://picsum.photos/seed/podcast1/300/300",
  duration: 3600,
};

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
    title:
      "An Extremely Long Episode Title That Should Be Truncated When Displayed Inside the Queue Section Card Component",
    podcastTitle: "The Very Verbose and Long-Winded Podcast About Everything",
    audioUrl: "https://example.com/audio3.mp3",
    duration: 1200,
  },
];

const meta: Meta<typeof QueueSection> = {
  title: "Dashboard/QueueSection",
  component: QueueSection,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof QueueSection>;

export const EmptyState: Story = {
  decorators: [audioPlayerContextDecorator()],
};

export const NowPlayingOnly: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: { currentEpisode: nowPlayingEpisode, isPlaying: true },
    }),
  ],
};

export const QueueWithoutCurrentEpisode: Story = {
  decorators: [
    audioPlayerContextDecorator({ state: { queue: queueEpisodes } }),
  ],
};

export const NowPlayingWithQueue: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
        currentEpisode: nowPlayingEpisode,
        isPlaying: true,
        queue: queueEpisodes,
      },
    }),
  ],
};

export const SingleQueueItem: Story = {
  decorators: [
    audioPlayerContextDecorator({ state: { queue: [queueEpisodes[0]] } }),
  ],
};

export const LongTitles: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
        currentEpisode: {
          id: "long-0",
          title:
            "An Episode With An Extremely Long Title That Will Definitely Overflow And Need Truncation In The Queue Section On The Dashboard Page",
          podcastTitle:
            "A Podcast With An Equally Long And Verbose Name That Also Needs Truncation To Fit",
          audioUrl: "https://example.com/audio-long-0.mp3",
        },
        queue: [queueEpisodes[2]],
      },
    }),
  ],
};

export const NoArtwork: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
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
      },
    }),
  ],
};
