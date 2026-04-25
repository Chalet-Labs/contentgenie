import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { BookmarkButton } from "@/components/audio-player/bookmark-button";
import { audioPlayerContextDecorator } from "@/test/story-fixtures";

const playingState = {
  currentEpisode: {
    id: "ep-123",
    title: "Test Episode",
    podcastTitle: "Test Podcast",
    audioUrl: "http://example.com/audio.mp3",
    artwork: undefined,
    duration: 3600,
  },
  isPlaying: true,
  isVisible: true,
  duration: 3600,
};

const layout: Decorator = (Story) => (
  <div className="flex items-end justify-center p-4" style={{ minHeight: 200 }}>
    <Story />
  </div>
);

const meta: Meta<typeof BookmarkButton> = {
  title: "AudioPlayer/BookmarkButton",
  component: BookmarkButton,
  decorators: [layout],
};

export default meta;
type Story = StoryObj<typeof BookmarkButton>;

export const Default: Story = {
  name: "Default (Episode in Library)",
  decorators: [
    audioPlayerContextDecorator({
      state: playingState,
      progress: { currentTime: 125, buffered: 0 },
    }),
  ],
};

export const NoEpisode: Story = {
  name: "No Episode Loaded (Hidden)",
  decorators: [
    audioPlayerContextDecorator({
      progress: { currentTime: 125, buffered: 0 },
    }),
  ],
};
