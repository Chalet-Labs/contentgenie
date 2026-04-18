import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { TopicSwitcher } from "@/components/trending/topic-switcher"
import type { TrendingTopic } from "@/db/schema"

const baseTopics: TrendingTopic[] = [
  { name: "Artificial Intelligence", description: "", episodeCount: 12, episodeIds: [], slug: "artificial-intelligence" },
  { name: "Climate Policy", description: "", episodeCount: 8, episodeIds: [], slug: "climate-policy" },
  { name: "Startup Funding", description: "", episodeCount: 5, episodeIds: [], slug: "startup-funding" },
  { name: "Remote Work", description: "", episodeCount: 9, episodeIds: [], slug: "remote-work" },
  { name: "Mental Health", description: "", episodeCount: 7, episodeIds: [], slug: "mental-health" },
]

const longNameTopics: TrendingTopic[] = [
  { name: "The Impact of Large Language Models on Enterprise Software Development", description: "", episodeCount: 11, episodeIds: [], slug: "the-impact-of-large-language-models-on-enterprise-software-development" },
  { name: "Decentralized Finance and the Future of Banking", description: "", episodeCount: 7, episodeIds: [], slug: "decentralized-finance-and-the-future-of-banking" },
  { name: "Quantum Computing Breakthroughs and Near-Term Commercial Applications", description: "", episodeCount: 4, episodeIds: [], slug: "quantum-computing-breakthroughs-and-near-term-commercial-applications" },
  { name: "Climate Tech", description: "", episodeCount: 9, episodeIds: [], slug: "climate-tech" },
]

const meta: Meta<typeof TopicSwitcher> = {
  title: "Trending/TopicSwitcher",
  component: TopicSwitcher,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TopicSwitcher>

export const Default: Story = {
  args: {
    topics: baseTopics,
    activeSlug: "startup-funding",
  },
}

export const ActiveFirst: Story = {
  args: {
    topics: baseTopics,
    activeSlug: "artificial-intelligence",
  },
}

export const SingleTopic: Story = {
  args: {
    topics: [{ name: "Artificial Intelligence", description: "", episodeCount: 12, episodeIds: [], slug: "artificial-intelligence" }],
    activeSlug: "artificial-intelligence",
  },
}

export const Empty: Story = {
  args: {
    topics: [],
    activeSlug: "anything",
  },
}

export const LongNames: Story = {
  args: {
    topics: longNameTopics,
    activeSlug: "climate-tech",
  },
}
