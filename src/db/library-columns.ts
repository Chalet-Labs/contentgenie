/** Shared column selections and DTO types for library/episode/podcast queries. */

import type { PodcastIndexEpisodeId } from "@/types/ids";
import {
  type CanonicalOverlapResult,
  type OverlapLabelKind,
} from "@/lib/topic-overlap";
import type { CanonicalTopicKind, CanonicalTopicStatus } from "@/db/schema";

export type { CanonicalTopicKind, CanonicalTopicStatus };

// -- Column selection constants (Drizzle `columns` allowlist) --

export const LIBRARY_ENTRY_COLUMNS = {
  id: true,
  userId: true,
  episodeId: true,
  savedAt: true,
  notes: true,
  rating: true,
  collectionId: true,
} as const;

export const EPISODE_LIST_COLUMNS = {
  id: true,
  podcastIndexId: true,
  title: true,
  description: true,
  audioUrl: true,
  duration: true,
  publishDate: true,
  worthItScore: true,
} as const;

export const PODCAST_LIST_COLUMNS = {
  id: true,
  podcastIndexId: true,
  title: true,
  imageUrl: true,
} as const;

export const COLLECTION_LIST_COLUMNS = {
  id: true,
  name: true,
} as const;

// -- DTO types (match query return shapes) --

export interface CanonicalTopicChip {
  id: number;
  label: string;
  kind: CanonicalTopicKind;
  status?: CanonicalTopicStatus;
}

export interface EpisodeListDTO {
  id: number;
  podcastIndexId: PodcastIndexEpisodeId;
  title: string;
  description: string | null;
  audioUrl: string | null;
  duration: number | null;
  publishDate: Date | null;
  worthItScore: string | null;
  canonicalTopics?: CanonicalTopicChip[];
}

export interface PodcastListDTO {
  id: number;
  podcastIndexId: string;
  title: string;
  imageUrl: string | null;
}

export interface CollectionListDTO {
  id: number;
  name: string;
}

export interface LibraryEntryDTO {
  id: number;
  userId: string;
  episodeId: number;
  savedAt: Date;
  notes: string | null;
  rating: number | null;
  collectionId: number | null;
}

export interface SavedItemDTO extends LibraryEntryDTO {
  episode: EpisodeListDTO & {
    podcast: PodcastListDTO;
  };
  collection?: CollectionListDTO | null;
}

export interface RecommendedEpisodeDTO extends EpisodeListDTO {
  podcastTitle: string;
  podcastImageUrl: string | null;
  bestTopicRank: number | null;
  topRankedTopic: string | null;
  overlapCount?: number;
  overlapTopic?: string | null;
  overlapLabel?: string | null;
  overlapLabelKind?: OverlapLabelKind | null;
  canonicalOverlap?: CanonicalOverlapResult | null;
}
