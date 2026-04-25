import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { ListMusic } from "lucide-react";
import { type AudioEpisode } from "@/contexts/audio-player-context";
import { Button } from "@/components/ui/button";
import { QueuePanel } from "@/components/audio-player/queue-panel";
import { audioPlayerContextDecorator } from "@/test/story-fixtures";

const playingEpisode: AudioEpisode = {
  id: "ep-playing",
  title: "Currently Playing Episode",
  podcastTitle: "Some Podcast",
  audioUrl: "https://example.com/playing.mp3",
  duration: 1800,
};

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
];

const playingState = {
  currentEpisode: playingEpisode,
  isPlaying: true,
  isVisible: true,
  duration: 1800,
};

const queueTrigger = (
  <Button variant="ghost" size="icon" aria-label="Queue">
    <ListMusic className="h-4 w-4" />
  </Button>
);

const baseArgs = {
  open: true,
  onOpenChange: () => {},
  trigger: queueTrigger,
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

const meta: Meta<typeof QueuePanel> = {
  title: "AudioPlayer/QueuePanel",
  component: QueuePanel,
};

export default meta;
type Story = StoryObj<typeof QueuePanel>;

export const EmptyQueue: Story = {
  args: baseArgs,
  decorators: [
    audioPlayerContextDecorator({ state: playingState }),
    popoverWrapper,
  ],
};

export const MultipleItems: Story = {
  args: baseArgs,
  decorators: [
    audioPlayerContextDecorator({
      state: { ...playingState, queue: queueEpisodes },
    }),
    popoverWrapper,
  ],
};

export const SingleItem: Story = {
  args: baseArgs,
  decorators: [
    audioPlayerContextDecorator({
      state: { ...playingState, queue: [queueEpisodes[0]] },
    }),
    popoverWrapper,
  ],
};

export const LongTitles: Story = {
  args: baseArgs,
  decorators: [
    audioPlayerContextDecorator({
      state: {
        ...playingState,
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
      },
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
      state: { ...playingState, queue: queueEpisodes },
    }),
    sheetWrapper,
  ],
};
