import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TopicEmptyState } from "@/components/topics/topic-empty-state";

const meta: Meta<typeof TopicEmptyState> = {
  title: "Topics/TopicEmptyState",
  component: TopicEmptyState,
};

export default meta;
type Story = StoryObj<typeof TopicEmptyState>;

export const ZeroEpisodes: Story = {
  args: {
    label: "Claude Opus 4.7 release",
    summarizedCount: 0,
    totalEpisodeCount: 4,
  },
};

export const OneEpisode: Story = {
  args: {
    label: "Anthropic Computer Use",
    summarizedCount: 1,
    totalEpisodeCount: 3,
  },
};

export const TwoEpisodes: Story = {
  args: {
    label: "OpenAI o5 reasoning model",
    summarizedCount: 2,
    totalEpisodeCount: 5,
  },
};
