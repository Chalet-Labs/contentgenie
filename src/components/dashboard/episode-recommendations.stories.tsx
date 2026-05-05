import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { asPodcastIndexEpisodeId } from "@/types/ids";
import {
  EpisodeRecommendations,
  EpisodeRecommendationsLoading,
  EPISODES_INITIAL,
} from "@/components/dashboard/episode-recommendations";
import type { RecommendedEpisodeDTO } from "@/db/library-columns";

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

function makeEpisode(
  id: number,
  title: string,
  podcastTitle: string,
  overrides: Partial<RecommendedEpisodeDTO> = {},
): RecommendedEpisodeDTO {
  return {
    id,
    podcastIndexId: asPodcastIndexEpisodeId(String(id * 100)),
    title,
    description: null,
    audioUrl: null,
    duration: null,
    publishDate: null,
    worthItScore: null,
    podcastTitle,
    podcastImageUrl: null,
    bestTopicRank: null,
    topRankedTopic: null,
    overlapCount: undefined,
    overlapTopic: null,
    overlapLabel: null,
    overlapLabelKind: null,
    ...overrides,
  };
}

const sampleEpisodes: RecommendedEpisodeDTO[] = [
  makeEpisode(
    1,
    "How AI is Changing Software Engineering",
    "Software Unscripted",
    {
      worthItScore: "8.5",
      duration: 3120,
      publishDate: new Date("2026-01-10"),
      overlapLabel: "Overlaps with 3 of your saved topics",
      overlapLabelKind: "high-overlap",
    },
  ),
  makeEpisode(
    2,
    "The Future of Remote Work After 2025",
    "The Knowledge Project",
    {
      worthItScore: "7.2",
      duration: 2700,
      publishDate: new Date("2026-01-12"),
    },
  ),
  makeEpisode(3, "Climate Policy: What Actually Works", "Ezra Klein Show", {
    worthItScore: "9.1",
    duration: 4200,
    publishDate: new Date("2026-01-08"),
    overlapLabel: "New topic you haven't explored yet",
    overlapLabelKind: "new-topic",
  }),
  makeEpisode(
    4,
    "Startup Funding in a High-Rate Environment",
    "My First Million",
    {
      duration: 5400,
      publishDate: new Date("2026-01-14"),
    },
  ),
  makeEpisode(
    5,
    "Inside the Mental Health Crisis at Work",
    "WorkLife with Adam Grant",
    {
      worthItScore: "8.8",
      duration: 2400,
      publishDate: new Date("2026-01-11"),
    },
  ),
  makeEpisode(6, "Crypto Regulation: Where Things Stand", "Unchained", {
    worthItScore: "6.5",
    duration: 3600,
    publishDate: new Date("2026-01-09"),
  }),
  makeEpisode(7, "Quantum Computing for Practitioners", "Practical AI", {
    duration: 2880,
    publishDate: new Date("2026-01-07"),
  }),
];

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof EpisodeRecommendations> = {
  title: "Dashboard/EpisodeRecommendations",
  component: EpisodeRecommendations,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="max-w-5xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EpisodeRecommendations>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

// sampleEpisodes.length exceeds EPISODES_INITIAL — the toggle button is visible.
export const Default: Story = {
  args: {
    episodes: sampleEpisodes,
  },
};

// Exactly EPISODES_INITIAL episodes — toggle button must NOT appear (N > N is false).
export const ExactThreshold: Story = {
  args: {
    episodes: sampleEpisodes.slice(0, EPISODES_INITIAL),
  },
};

export const Empty: Story = {
  args: {
    episodes: [],
  },
};

export const Loading: StoryObj<typeof EpisodeRecommendationsLoading> = {
  render: () => <EpisodeRecommendationsLoading />,
};

export const WithCanonicalOverlapRepeat: Story = {
  args: {
    episodes: [
      makeEpisode(
        1,
        "How AI is Changing Software Engineering",
        "Software Unscripted",
        {
          canonicalOverlap: {
            kind: "repeat",
            count: 5,
            topicLabel: "creatine",
            topicId: 1,
          },
        },
      ),
      ...sampleEpisodes.slice(1),
    ],
  },
};

export const WithCanonicalOverlapNew: Story = {
  args: {
    episodes: [
      makeEpisode(
        1,
        "How AI is Changing Software Engineering",
        "Software Unscripted",
        {
          canonicalOverlap: {
            kind: "new",
            topicLabel: "OpenAI o4 preview",
            topicId: 2,
          },
        },
      ),
      ...sampleEpisodes.slice(1),
    ],
  },
};

export const WithCanonicalNullEmptyState: Story = {
  args: {
    episodes: sampleEpisodes.map((e) => ({ ...e, canonicalOverlap: null })),
  },
};
