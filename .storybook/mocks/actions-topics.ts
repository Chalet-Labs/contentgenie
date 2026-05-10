// Stub for `@/app/actions/topics` server actions in Storybook. The real module
// is `"use server"` and pulls in Clerk auth, the DB pool, and Trigger.dev SDK,
// none of which load in the browser-side Storybook bundle.
//
// Returning a 'cached' envelope by default makes the Refresh button feel real
// without actually doing anything.

export const triggerTopicDigestRefresh = async () => ({
  success: true as const,
  data: { status: "cached" as const, digestId: 22 },
});

export const triggerTopicDigestGeneration = async () => ({
  success: true as const,
  data: { status: "cached" as const, digestId: 22 },
});

// Used by `<TopicDigestList>`. Default returns empty so the component renders
// null (its own empty-state behavior). Stories that need a populated list
// override this per-story.
export const getRecentTopicDigests = async () => ({
  success: true as const,
  data: [] as Array<{
    canonicalId: number;
    label: string;
    kind: string;
    episodeCount: number;
    generatedAt: Date;
    consensusPreview: string;
  }>,
});

export const getTopicDetailData = async () => ({
  success: true as const,
  data: {
    canonical: {
      id: 1,
      label: "Demo topic",
      kind: "concept" as const,
      status: "active" as const,
      summary: "",
      ongoing: false,
      episodeCount: 0,
      completedSummaryCount: 0,
    },
    digest: null,
    episodes: [],
    relatedTopics: [],
  },
});

// Type-only re-exports below are erased at build time but listed here as a
// reminder of the runtime values consumers might import in the future.
export type TopicDetailCanonical = {
  id: number;
  label: string;
  kind: string;
  status: string;
  summary: string;
  ongoing: boolean;
  episodeCount: number;
  completedSummaryCount: number;
};

export type TopicEpisode = {
  id: number;
  podcastIndexEpisodeId: string;
  title: string;
  podcastTitle: string;
  podcastFeedId: string;
  coverageScore: number;
  joinedAt: Date;
  isListened: boolean;
  isSaved: boolean;
};

export type RelatedTopic = {
  id: number;
  label: string;
  kind: string;
  similarity: number;
};

export type TopicDigest = {
  id: number;
  digestMarkdown: string;
  consensusPoints: string[];
  disagreementPoints: string[];
  episodeIds: number[];
  episodeCountAtGeneration: number;
  modelUsed: string;
  generatedAt: Date;
};

export type TopicDetailData = {
  canonical: TopicDetailCanonical;
  digest: TopicDigest | null;
  episodes: TopicEpisode[];
  relatedTopics: RelatedTopic[];
};
