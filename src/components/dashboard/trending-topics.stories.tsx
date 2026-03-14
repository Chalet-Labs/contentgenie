import type { Meta, StoryObj } from "@storybook/react"
import { TrendingTopics, TrendingTopicsLoading } from "@/components/dashboard/trending-topics"
import type { TrendingTopic } from "@/db/schema"

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const baseTopics: TrendingTopic[] = [
  { name: "Artificial Intelligence", description: "", episodeCount: 12, episodeIds: [] },
  { name: "Climate Policy", description: "", episodeCount: 8, episodeIds: [] },
  { name: "Startup Funding", description: "", episodeCount: 5, episodeIds: [] },
  { name: "Remote Work", description: "", episodeCount: 9, episodeIds: [] },
  { name: "Mental Health", description: "", episodeCount: 7, episodeIds: [] },
  { name: "Cryptocurrency", description: "", episodeCount: 3, episodeIds: [] },
]

const singleTopic: TrendingTopic[] = [
  { name: "Artificial Intelligence", description: "", episodeCount: 12, episodeIds: [] },
]

const maxTopics: TrendingTopic[] = [
  ...baseTopics,
  { name: "Supply Chain", description: "", episodeCount: 4, episodeIds: [] },
  { name: "Space Exploration", description: "", episodeCount: 6, episodeIds: [] },
]

const longNameTopics: TrendingTopic[] = [
  { name: "The Impact of Large Language Models on Enterprise Software Development", description: "", episodeCount: 11, episodeIds: [] },
  { name: "Decentralized Finance", description: "", episodeCount: 7, episodeIds: [] },
  { name: "Quantum Computing Breakthroughs and Near-Term Commercial Applications", description: "", episodeCount: 4, episodeIds: [] },
  { name: "Climate Tech", description: "", episodeCount: 9, episodeIds: [] },
]

const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
const olderDate = new Date(Date.now() - 30 * 60 * 1000)       // 30 minutes ago

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof TrendingTopics> = {
  title: "Dashboard/TrendingTopics",
  component: TrendingTopics,
  parameters: {
    layout: "padded",
  },
}

export default meta
type Story = StoryObj<typeof TrendingTopics>

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    topics: baseTopics,
    generatedAt: recentDate,
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
}

export const SingleTopic: Story = {
  args: {
    topics: singleTopic,
    generatedAt: recentDate,
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
}

export const MaxTopics: Story = {
  args: {
    topics: maxTopics,
    generatedAt: olderDate,
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
}

export const LongNames: Story = {
  args: {
    topics: longNameTopics,
    generatedAt: recentDate,
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
}

export const Loading: StoryObj<typeof TrendingTopicsLoading> = {
  render: () => <TrendingTopicsLoading />,
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
}
