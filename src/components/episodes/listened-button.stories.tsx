import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ListenedButton } from "@/components/episodes/listened-button";

const meta: Meta<typeof ListenedButton> = {
  title: "Episodes/ListenedButton",
  component: ListenedButton,
};

export default meta;
type Story = StoryObj<typeof ListenedButton>;

export const Unlistened: Story = {
  args: {
    podcastIndexEpisodeId: "ep-1",
    isListened: false,
  },
};

export const Listened: Story = {
  args: {
    podcastIndexEpisodeId: "ep-1",
    isListened: true,
  },
};
