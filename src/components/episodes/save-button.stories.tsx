import type { Meta, StoryObj } from "@storybook/react";
import { SaveButton } from "./save-button";

const mockEpisodeData = {
  podcastIndexId: "123",
  title: "Test Episode",
  description: "A test episode description",
  podcast: {
    podcastIndexId: "456",
    title: "Test Podcast",
  },
};

const meta: Meta<typeof SaveButton> = {
  title: "Episodes/SaveButton",
  component: SaveButton,
};

export default meta;
type Story = StoryObj<typeof SaveButton>;

export const Unsaved: Story = {
  args: {
    episodeData: mockEpisodeData,
    initialSaved: false,
  },
};

export const Saved: Story = {
  args: {
    episodeData: mockEpisodeData,
    initialSaved: true,
  },
};

export const SmallSize: Story = {
  args: {
    episodeData: mockEpisodeData,
    size: "sm",
  },
};
