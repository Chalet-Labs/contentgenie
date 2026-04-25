import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { VolumeControl } from "@/components/audio-player/volume-control";
import { audioPlayerContextDecorator } from "@/test/story-fixtures";

const padded: Decorator = (Story) => (
  <div className="p-4">
    <Story />
  </div>
);

const meta: Meta<typeof VolumeControl> = {
  title: "AudioPlayer/VolumeControl",
  component: VolumeControl,
  decorators: [padded],
};

export default meta;
type Story = StoryObj<typeof VolumeControl>;

export const Default: Story = {
  decorators: [audioPlayerContextDecorator({ state: { volume: 1 } })],
};

export const Muted: Story = {
  decorators: [audioPlayerContextDecorator({ state: { volume: 0 } })],
};

export const HalfVolume: Story = {
  decorators: [audioPlayerContextDecorator({ state: { volume: 0.5 } })],
};

export const MaxVolume: Story = {
  decorators: [audioPlayerContextDecorator({ state: { volume: 1 } })],
};
