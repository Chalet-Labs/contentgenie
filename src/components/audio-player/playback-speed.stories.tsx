import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { PlaybackSpeed } from "./playback-speed";
import { audioPlayerContextDecorator } from "@/test/story-fixtures";

const padded: Decorator = (Story) => (
  <div className="p-4">
    <Story />
  </div>
);

const meta: Meta<typeof PlaybackSpeed> = {
  title: "AudioPlayer/PlaybackSpeed",
  component: PlaybackSpeed,
  decorators: [padded],
};

export default meta;
type Story = StoryObj<typeof PlaybackSpeed>;

export const Speed1x: Story = {
  decorators: [audioPlayerContextDecorator({ state: { playbackSpeed: 1 } })],
};

export const Speed125x: Story = {
  name: "Speed 1.25x",
  decorators: [audioPlayerContextDecorator({ state: { playbackSpeed: 1.25 } })],
};

export const Speed15x: Story = {
  name: "Speed 1.5x",
  decorators: [audioPlayerContextDecorator({ state: { playbackSpeed: 1.5 } })],
};

export const Speed2x: Story = {
  decorators: [audioPlayerContextDecorator({ state: { playbackSpeed: 2 } })],
};
