import type { Meta, StoryObj } from "@storybook/react"
import { TrendingTopics, TrendingTopicsLoading } from "@/components/dashboard/trending-topics"
import type { TrendingTopic } from "@/db/schema"
import { STORY_TWO_HOURS_AGO, STORY_THIRTY_MIN_AGO } from "@/test/story-fixtures"

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const baseTopics: TrendingTopic[] = [
  { name: "Artificial Intelligence", description: "", episodeCount: 12, episodeIds: [], slug: "artificial-intelligence" },
  { name: "Climate Policy", description: "", episodeCount: 8, episodeIds: [], slug: "climate-policy" },
  { name: "Startup Funding", description: "", episodeCount: 5, episodeIds: [], slug: "startup-funding" },
  { name: "Remote Work", description: "", episodeCount: 9, episodeIds: [], slug: "remote-work" },
  { name: "Mental Health", description: "", episodeCount: 7, episodeIds: [], slug: "mental-health" },
  { name: "Cryptocurrency", description: "", episodeCount: 3, episodeIds: [], slug: "cryptocurrency" },
]

const singleTopic: TrendingTopic[] = [
  { name: "Artificial Intelligence", description: "", episodeCount: 12, episodeIds: [], slug: "artificial-intelligence" },
]

const maxTopics: TrendingTopic[] = [
  ...baseTopics,
  { name: "Supply Chain", description: "", episodeCount: 4, episodeIds: [], slug: "supply-chain" },
  { name: "Space Exploration", description: "", episodeCount: 6, episodeIds: [], slug: "space-exploration" },
]

const longNameTopics: TrendingTopic[] = [
  { name: "The Impact of Large Language Models on Enterprise Software Development", description: "", episodeCount: 11, episodeIds: [], slug: "the-impact-of-large-language-models-on-enterprise-software-development" },
  { name: "Decentralized Finance", description: "", episodeCount: 7, episodeIds: [], slug: "decentralized-finance" },
  { name: "Quantum Computing Breakthroughs and Near-Term Commercial Applications", description: "", episodeCount: 4, episodeIds: [], slug: "quantum-computing-breakthroughs-and-near-term-commercial-applications" },
  { name: "Climate Tech", description: "", episodeCount: 9, episodeIds: [], slug: "climate-tech" },
]

const twoHoursAgo = STORY_TWO_HOURS_AGO
const thirtyMinutesAgo = STORY_THIRTY_MIN_AGO

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof TrendingTopics> = {
  title: "Dashboard/TrendingTopics",
  component: TrendingTopics,
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
type Story = StoryObj<typeof TrendingTopics>

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: {
    topics: baseTopics,
    generatedAt: twoHoursAgo,
  },
}

export const SingleTopic: Story = {
  args: {
    topics: singleTopic,
    generatedAt: twoHoursAgo,
  },
}

export const MaxTopics: Story = {
  args: {
    topics: maxTopics,
    generatedAt: thirtyMinutesAgo,
  },
}

export const LongNames: Story = {
  args: {
    topics: longNameTopics,
    generatedAt: twoHoursAgo,
  },
}

export const Loading: StoryObj<typeof TrendingTopicsLoading> = {
  render: () => <TrendingTopicsLoading />,
}
