import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { type AudioEpisode } from "@/contexts/audio-player-context";
import { PlayEpisodeButton } from "@/components/audio-player/play-episode-button";
import { audioPlayerContextDecorator } from "@/test/story-fixtures";

const testEpisode: AudioEpisode = {
  id: "ep-1",
  title: "How to Build Better Products",
  podcastTitle: "Design Matters",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://picsum.photos/seed/podcast/300/300",
  duration: 2400,
};

const otherEpisode: AudioEpisode = {
  id: "ep-2",
  title: "A Different Episode",
  podcastTitle: "Other Podcast",
  audioUrl: "https://example.com/other.mp3",
  duration: 1800,
};

const meta: Meta<typeof PlayEpisodeButton> = {
  title: "AudioPlayer/PlayEpisodeButton",
  component: PlayEpisodeButton,
};

export default meta;
type Story = StoryObj<typeof PlayEpisodeButton>;

export const Default: Story = {
  args: { episode: testEpisode },
  decorators: [audioPlayerContextDecorator()],
};

export const NowPlaying: Story = {
  args: { episode: testEpisode },
  decorators: [
    audioPlayerContextDecorator({ state: { currentEpisode: testEpisode } }),
  ],
};

export const DifferentEpisodePlaying: Story = {
  args: { episode: testEpisode },
  decorators: [
    audioPlayerContextDecorator({ state: { currentEpisode: otherEpisode } }),
  ],
};
