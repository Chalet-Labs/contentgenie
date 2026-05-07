import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TopicEpisodeList } from "@/components/topics/topic-episode-list";
import type { TopicEpisode } from "@/app/actions/topics";
import { asPodcastIndexEpisodeId } from "@/types/ids";

// Row links currently target `/podcast/{feedId}?episode={podcastIndexEpisodeId}`
// because no `/episode/[id]` route exists yet (#399). When that route lands, update
// `buildEpisodeHref` in `topic-episode-list.tsx` to point there directly.
const meta: Meta<typeof TopicEpisodeList> = {
  title: "Topics/TopicEpisodeList",
  component: TopicEpisodeList,
};

export default meta;
type Story = StoryObj<typeof TopicEpisodeList>;

function makeEpisode(overrides: Partial<TopicEpisode> = {}): TopicEpisode {
  return {
    id: 1,
    podcastIndexEpisodeId: asPodcastIndexEpisodeId("pi-1"),
    title: "Demo episode",
    podcastTitle: "Demo Podcast",
    podcastFeedId: "demo-feed",
    coverageScore: 0.8,
    isListened: false,
    isSaved: false,
    ...overrides,
  };
}

const mixed = [
  makeEpisode({
    id: 1,
    title: "Anthropic announces Claude Opus 4.7",
    podcastTitle: "AI Pulse",
    coverageScore: 0.94,
  }),
  makeEpisode({
    id: 2,
    title: "Inside the new pricing tiers",
    podcastTitle: "AI Pulse",
    coverageScore: 0.71,
    isListened: true,
  }),
  makeEpisode({
    id: 3,
    title: "Why context windows matter",
    podcastTitle: "Latent Space",
    coverageScore: 0.55,
    isSaved: true,
  }),
];

export const WithMixed: Story = {
  args: { episodes: mixed },
};

export const AllListened: Story = {
  args: {
    episodes: mixed.map((e) => ({ ...e, isListened: true })),
  },
};

export const EmptyAfterFilter: Story = {
  args: { episodes: [] },
};

export const EmptyNoEpisodes: Story = {
  args: { episodes: [] },
};
