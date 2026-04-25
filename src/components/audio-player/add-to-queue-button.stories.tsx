import { asPodcastIndexEpisodeId } from "@/types/ids";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { type AudioEpisode } from "@/contexts/audio-player-context";
import { AddToQueueButton } from "@/components/audio-player/add-to-queue-button";
import { audioPlayerContextDecorator } from "@/test/story-fixtures";

const testEpisode: AudioEpisode = {
  id: asPodcastIndexEpisodeId("ep-1"),
  title: "How to Build Better Products",
  podcastTitle: "Design Matters",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://picsum.photos/seed/podcast/300/300",
  duration: 2400,
};

const playingEpisode: AudioEpisode = {
  id: asPodcastIndexEpisodeId("ep-playing"),
  title: "Currently Playing Episode",
  podcastTitle: "Some Podcast",
  audioUrl: "https://example.com/playing.mp3",
  duration: 1800,
};

const playingState = {
  currentEpisode: playingEpisode,
  isPlaying: true,
  isVisible: true,
  duration: 1800,
};

const meta: Meta<typeof AddToQueueButton> = {
  title: "AudioPlayer/AddToQueueButton",
  component: AddToQueueButton,
  decorators: [audioPlayerContextDecorator({ state: playingState })],
};

export default meta;
type Story = StoryObj<typeof AddToQueueButton>;

export const Default: Story = {
  args: { episode: testEpisode, variant: "full" },
};

export const IconVariant: Story = {
  args: { episode: testEpisode, variant: "icon" },
};

export const AlreadyInQueue: Story = {
  args: { episode: testEpisode, variant: "full" },
  decorators: [
    audioPlayerContextDecorator({
      state: { ...playingState, queue: [testEpisode] },
    }),
  ],
};

export const NowPlaying: Story = {
  args: { episode: playingEpisode, variant: "full" },
};
