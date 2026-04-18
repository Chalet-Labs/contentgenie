import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { TrendingTopics, TrendingTopicsLoading } from "@/components/dashboard/trending-topics"
import type { TrendingTopic } from "@/db/schema"
import { STORY_TWO_HOURS_AGO, STORY_THIRTY_MIN_AGO } from "@/test/story-fixtures"

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const baseTopics: TrendingTopic[] = [
  { name: "Artificial Intelligence", description: "How large language models are reshaping software engineering and knowledge work.", episodeCount: 12, episodeIds: [], slug: "artificial-intelligence" },
  { name: "Climate Policy", description: "International carbon agreements and the gap between pledges and implementation.", episodeCount: 8, episodeIds: [], slug: "climate-policy" },
  { name: "Startup Funding", description: "Venture capital trends in a higher-for-longer rate environment and what founders should expect.", episodeCount: 5, episodeIds: [], slug: "startup-funding" },
  { name: "Remote Work", description: "Return-to-office mandates, hybrid models, and how distributed teams maintain culture.", episodeCount: 9, episodeIds: [], slug: "remote-work" },
  { name: "Mental Health", description: "Workplace burnout, therapy access gaps, and digital mental health tools under scrutiny.", episodeCount: 7, episodeIds: [], slug: "mental-health" },
  { name: "Cryptocurrency", description: "Regulatory developments, institutional adoption, and the aftermath of high-profile collapses.", episodeCount: 3, episodeIds: [], slug: "cryptocurrency" },
]

const longNameTopics: TrendingTopic[] = [
  { name: "The Impact of Large Language Models on Enterprise Software Development Workflows", description: "From code review to architecture decisions, how LLMs are changing the day-to-day of professional software engineers.", episodeCount: 11, episodeIds: [], slug: "the-impact-of-large-language-models-on-enterprise-software-development" },
  { name: "Decentralized Finance and the Future of Banking Infrastructure", description: "DeFi protocols, stablecoins, and what traditional banks are doing to compete.", episodeCount: 7, episodeIds: [], slug: "decentralized-finance" },
  { name: "Quantum Computing Breakthroughs and Near-Term Commercial Applications", description: "Where quantum advantage is real today versus where it remains a research problem.", episodeCount: 4, episodeIds: [], slug: "quantum-computing-breakthroughs-and-near-term-commercial-applications" },
  { name: "Climate Technology Investment and Green Infrastructure Deployment at Scale", description: "Grid modernization, battery storage, and the policy levers driving clean energy adoption.", episodeCount: 9, episodeIds: [], slug: "climate-tech" },
]

const longDescriptionTopics: TrendingTopic[] = [
  { name: "AI Regulation", description: "Governments worldwide are racing to pass AI governance frameworks. The EU AI Act introduced tiered risk categories that critics argue stifle innovation while proponents say protect fundamental rights. Meanwhile US federal efforts remain fragmented and state-level rules vary widely — creating compliance headaches for multinational companies.", episodeCount: 14, episodeIds: [], slug: "ai-regulation" },
  { name: "Supply Chain Resilience", description: "After pandemic-era disruptions exposed critical single-supplier dependencies, global manufacturers are diversifying across geographies and building larger safety-stock buffers. The tradeoffs between just-in-time efficiency and resilience are reshaping procurement strategy and where factories get built.", episodeCount: 6, episodeIds: [], slug: "supply-chain-resilience" },
  { name: "Space Commercialization", description: "Launch costs have fallen dramatically with reusable rockets, opening low Earth orbit to a new class of commercial operators. Satellite internet mega-constellations, in-orbit servicing, and the early-stage lunar economy are all competing for capital and spectrum allocations from regulators still using 1960s-era frameworks.", episodeCount: 9, episodeIds: [], slug: "space-commercialization" },
]

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
    generatedAt: STORY_TWO_HOURS_AGO,
  },
}

export const LongNames: Story = {
  args: {
    topics: longNameTopics,
    generatedAt: STORY_TWO_HOURS_AGO,
  },
}

export const LongDescriptions: Story = {
  args: {
    topics: longDescriptionTopics,
    generatedAt: STORY_THIRTY_MIN_AGO,
  },
}

export const SingleTopic: Story = {
  args: {
    topics: [baseTopics[0]],
    generatedAt: STORY_TWO_HOURS_AGO,
  },
}

export const Loading: StoryObj<typeof TrendingTopicsLoading> = {
  render: () => <TrendingTopicsLoading />,
}
