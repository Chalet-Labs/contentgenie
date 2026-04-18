import type { WorthItDimensionsData } from "@/lib/openrouter";

export interface EpisodeData {
  id: number | string;
  title: string;
  description: string;
  datePublished: number;
  duration: number;
  enclosureUrl: string;
  episode: number | null;
  episodeType: string;
  season: number;
  feedId: number;
  feedImage: string;
  image: string;
  link: string;
  chaptersUrl?: string | null;
}

export interface PodcastData {
  id: number | string;
  title: string;
  author: string;
  ownerName: string;
  image: string;
  artwork: string;
  categories: Record<string, string>;
}

export interface SummaryData {
  summary: string;
  keyTakeaways: string[];
  worthItScore: number | null;
  worthItReason?: string;
  worthItDimensions?: WorthItDimensionsData | null;
  cached: boolean;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "Unknown";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function formatTranscriptSource(source: string | null): string {
  switch (source) {
    case "podcastindex":
      return "PodcastIndex";
    case "assemblyai":
      return "AI Transcribed";
    case "description-url":
      return "Episode Page";
    default:
      return source ?? "Unknown";
  }
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

export function buildSignUpHref(redirectPath: string): string {
  return `/sign-up?redirect_url=${encodeURIComponent(redirectPath)}`;
}

export function getEpisodeArtworkUrl(
  episode: EpisodeData,
  podcast: PodcastData | null
): string {
  return episode.image || episode.feedImage || podcast?.artwork || podcast?.image || "";
}

export function getSafeEpisodeLink(link: string): string | null {
  if (!link) return null;

  try {
    const parsed = new URL(link);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}
