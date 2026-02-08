import { createHash } from "crypto";

const API_BASE_URL = "https://api.podcastindex.org/api/1.0";

// Read env vars at runtime, not module load time (Next.js bundling issue)
function getApiKey(): string {
  return process.env.PODCASTINDEX_API_KEY || "";
}

function getApiSecret(): string {
  return process.env.PODCASTINDEX_API_SECRET || "";
}

// Types for PodcastIndex API responses
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

export interface SearchPodcastsResponse {
  status: string;
  feeds: PodcastIndexPodcast[];
  count: number;
  query: string;
  description: string;
}

export interface GetPodcastResponse {
  status: string;
  feed: PodcastIndexPodcast;
  description: string;
}

export interface GetEpisodesResponse {
  status: string;
  items: PodcastIndexEpisode[];
  count: number;
  query: string;
  description: string;
}

export interface GetEpisodeResponse {
  status: string;
  episode: PodcastIndexEpisode;
  description: string;
}

export interface TrendingPodcastsResponse {
  status: string;
  feeds: PodcastIndexPodcast[];
  count: number;
  max: number;
  since: number;
  description: string;
}

// Generate authentication headers for PodcastIndex API
function getAuthHeaders(): Record<string, string> {
  const apiKey = getApiKey();
  const apiSecret = getApiSecret();
  const apiHeaderTime = Math.floor(Date.now() / 1000);
  const dataToHash = apiKey + apiSecret + apiHeaderTime;
  const hash = createHash("sha1")
    .update(dataToHash)
    .digest("hex");

  return {
    "X-Auth-Date": apiHeaderTime.toString(),
    "X-Auth-Key": apiKey,
    Authorization: hash,
    "User-Agent": "ContentGenie/1.0",
  };
}

// Generic fetch function with error handling
async function fetchFromPodcastIndex<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${API_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`PodcastIndex API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data as T;
}

// Search for podcasts by term
export async function searchPodcasts(
  query: string,
  max: number = 20
): Promise<SearchPodcastsResponse> {
  return fetchFromPodcastIndex<SearchPodcastsResponse>("/search/byterm", {
    q: query,
    max: max.toString(),
  });
}

// Get podcast by feed ID
export async function getPodcastById(
  feedId: number
): Promise<GetPodcastResponse> {
  return fetchFromPodcastIndex<GetPodcastResponse>("/podcasts/byfeedid", {
    id: feedId.toString(),
  });
}

// Get podcast by iTunes ID
export async function getPodcastByItunesId(
  itunesId: number
): Promise<GetPodcastResponse> {
  return fetchFromPodcastIndex<GetPodcastResponse>("/podcasts/byitunesid", {
    id: itunesId.toString(),
  });
}

// Get episodes by feed ID
export async function getEpisodesByFeedId(
  feedId: number,
  max: number = 20
): Promise<GetEpisodesResponse> {
  return fetchFromPodcastIndex<GetEpisodesResponse>("/episodes/byfeedid", {
    id: feedId.toString(),
    max: max.toString(),
  });
}

// Get episode by ID
export async function getEpisodeById(
  episodeId: number
): Promise<GetEpisodeResponse> {
  return fetchFromPodcastIndex<GetEpisodeResponse>("/episodes/byid", {
    id: episodeId.toString(),
  });
}

// Get trending podcasts
export async function getTrendingPodcasts(
  max: number = 20,
  lang: string = "en",
  categories?: string
): Promise<TrendingPodcastsResponse> {
  const params: Record<string, string> = {
    max: max.toString(),
    lang,
  };
  if (categories) {
    params.cat = categories;
  }
  return fetchFromPodcastIndex<TrendingPodcastsResponse>("/podcasts/trending", params);
}

// Search episodes by term
export async function searchEpisodes(
  query: string,
  max: number = 20
): Promise<GetEpisodesResponse> {
  return fetchFromPodcastIndex<GetEpisodesResponse>("/search/byterm", {
    q: query,
    max: max.toString(),
  });
}

// Format duration in seconds to human readable string
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "Unknown";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Format Unix timestamp to readable date
export function formatPublishDate(timestamp: number): string {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
