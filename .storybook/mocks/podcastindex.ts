// Storybook mock for @/lib/podcastindex — stubs out the Node `crypto` dependency

export interface PodcastIndexPodcast {
  id: number;
  podcastGuid: string;
  title: string;
  url: string;
  originalUrl: string;
  link: string;
  description: string;
  author: string;
  ownerName: string;
  image: string;
  artwork: string;
  lastUpdateTime: number;
  lastCrawlTime: number;
  lastParseTime: number;
  lastGoodHttpStatusTime: number;
  lastHttpStatus: number;
  contentType: string;
  itunesId: number | null;
  itunesType: string;
  generator: string;
  language: string;
  explicit: boolean;
  type: number;
  medium: string;
  dead: number;
  episodeCount: number;
  crawlErrors: number;
  parseErrors: number;
  categories: Record<string, string>;
  locked: number;
  imageUrlHash: number;
  newestItemPubdate: number;
}

export interface PodcastIndexEpisode {
  id: number;
  title: string;
  link: string;
  description: string;
  guid: string;
  datePublished: number;
  datePublishedPretty: string;
  dateCrawled: number;
  enclosureUrl: string;
  enclosureType: string;
  enclosureLength: number;
  duration: number;
  explicit: number;
  episode: number | null;
  episodeType: string;
  season: number;
  image: string;
  feedItunesId: number | null;
  feedImage: string;
  feedId: number;
  feedLanguage: string;
  feedDead: number;
  feedDuplicateOf: number | null;
  chaptersUrl: string | null;
  transcriptUrl: string | null;
  soundbite: {
    startTime: number;
    duration: number;
    title: string;
  } | null;
  soundbites: Array<{
    startTime: number;
    duration: number;
    title: string;
  }>;
  transcripts: Array<{
    url: string;
    type: string;
  }>;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "Unknown";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatPublishDate(timestamp: number): string {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export async function searchPodcasts() {
  return { status: "true", feeds: [], count: 0, query: "", description: "" };
}
export async function getPodcastById() {
  return { status: "true", feed: {} as PodcastIndexPodcast, description: "" };
}
export async function getEpisodesByFeedId() {
  return { status: "true", items: [], count: 0, query: "", description: "" };
}
export async function getEpisodeById() {
  return { status: "true", episode: {} as PodcastIndexEpisode, description: "" };
}
export async function getTrendingPodcasts() {
  return { status: "true", feeds: [], count: 0, max: 0, since: 0, description: "" };
}
export async function searchEpisodes() {
  return { status: "true", items: [], count: 0, query: "", description: "" };
}
