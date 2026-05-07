import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TopicEmptyState } from "@/components/topics/topic-empty-state";

const meta: Meta<typeof TopicEmptyState> = {
  title: "Topics/TopicEmptyState",
  component: TopicEmptyState,
};

export default meta;
type Story = StoryObj<typeof TopicEmptyState>;

export const ZeroEpisodes: Story = {
  args: { label: "Claude Opus 4.7 release", episodeCount: 0 },
};

export const OneEpisode: Story = {
  args: { label: "Anthropic Computer Use", episodeCount: 1 },
};

export const TwoEpisodes: Story = {
  args: { label: "OpenAI o5 reasoning model", episodeCount: 2 },
};
