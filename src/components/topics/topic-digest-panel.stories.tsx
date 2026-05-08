import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TopicDigestPanel } from "@/components/topics/topic-digest-panel";
import type { TopicDigest } from "@/app/actions/topics";

const meta: Meta<typeof TopicDigestPanel> = {
  title: "Topics/TopicDigestPanel",
  component: TopicDigestPanel,
};

export default meta;
type Story = StoryObj<typeof TopicDigestPanel>;

const sampleDigest: TopicDigest = {
  id: 22,
  digestMarkdown: `Across recent coverage, hosts focused on benchmark gains and pricing.

Key recurring threads include the new context window, latency improvements, and developer ergonomics.`,
  consensusPoints: [
    "Reasoning quality is meaningfully ahead of the prior generation",
    "Pricing for the higher tier remains a sticking point",
    "Most evaluators converged on coding tasks as the strongest workload",
  ],
  disagreementPoints: [
    "Hosts disagree about whether vision improvements are 'production ready'",
    "Some argue the cheaper tier is the better default; others prefer the flagship",
  ],
  episodeCountAtGeneration: 5,
  modelUsed: "openai/gpt-x",
  generatedAt: new Date(Date.now() - 1000 * 60 * 22),
};

export const WithDigest: Story = {
  args: {
    canonicalTopicId: 1,
    initialDigest: sampleDigest,
    initialRunId: null,
    initialAccessToken: null,
    canRefresh: true,
  },
};

export const LoadingWithRealtime: Story = {
  args: {
    canonicalTopicId: 1,
    initialDigest: null,
    initialRunId: "run_demo",
    initialAccessToken: "tok_demo",
    canRefresh: true,
  },
};

export const RefreshIneligible: Story = {
  args: {
    canonicalTopicId: 1,
    initialDigest: null,
    initialRunId: null,
    initialAccessToken: null,
    canRefresh: false,
  },
};

export const ErrorFromRun: Story = {
  args: {
    canonicalTopicId: 1,
    initialDigest: sampleDigest,
    initialRunId: null,
    initialAccessToken: null,
    canRefresh: true,
  },
};
