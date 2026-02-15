import type { Meta, StoryObj } from "@storybook/react";
import { ShareButton } from "./share-button";

const meta: Meta<typeof ShareButton> = {
  title: "UI/ShareButton",
  component: ShareButton,
};

export default meta;
type Story = StoryObj<typeof ShareButton>;

export const Default: Story = {
  args: {
    title: "The Future of AI in Podcasting",
    text: "Check out this episode of Tech Talk Daily on ContentGenie",
    url: "https://contentgenie.app/episode/12345",
  },
};

export const Podcast: Story = {
  args: {
    title: "Tech Talk Daily",
    text: "Check out this podcast on ContentGenie",
    url: "https://contentgenie.app/podcast/67890",
  },
};

export const Collection: Story = {
  args: {
    title: "My Favorites",
    url: "https://contentgenie.app/library/collection/42",
    size: "sm",
  },
};

export const SmallSize: Story = {
  args: {
    title: "Small Share Button",
    url: "https://contentgenie.app/episode/99",
    size: "sm",
  },
};
