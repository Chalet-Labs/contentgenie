import { z } from "zod";

import {
  asPodcastIndexEpisodeId,
  type PodcastIndexEpisodeId,
} from "@/types/ids";

const trimmedNonEmpty = z.string().trim().min(1).max(500);

// Restrict URL schemes to http/https so user-supplied payloads can't land
// javascript:, data:, file:, ftp:, etc. into the denormalized columns. HTTP is
// intentionally allowed because legacy podcast RSS feeds still serve plain-HTTP
// audio URLs; tightening to HTTPS-only would break playback for those feeds.
const httpOrHttpsUrl = z.url({ protocol: /^https?$/ }).max(2048);
const optionalHttpOrHttpsUrl = httpOrHttpsUrl.optional();

// Cap duration and currentTime at 1,000,000 seconds (~11.5 days). Keeps Zod
// rejections semantic rather than bubbling up from the decimal(12,3) column.
export const MAX_TIME_SECONDS = 1_000_000;

// Server queue cap. Shared with `loadQueue()` so localStorage hydration
// truncates before ever handing off to `setQueue`, which rejects oversized
// arrays via `queueSchema.max(MAX_QUEUE_ITEMS)`.
export const MAX_QUEUE_ITEMS = 200;

export const audioEpisodeSchema = z
  .object({
    // Post-validation cast — client/RSC payload string, trimmed and length-checked.
    id: trimmedNonEmpty.transform((v) => asPodcastIndexEpisodeId(v)),
    title: trimmedNonEmpty,
    podcastTitle: trimmedNonEmpty,
    audioUrl: httpOrHttpsUrl,
    artwork: optionalHttpOrHttpsUrl,
    // Mirror the integer("duration") DB column — fractional seconds would be
    // silently truncated on insert (or fail, depending on the driver).
    duration: z
      .number()
      .int()
      .nonnegative()
      .finite()
      .max(MAX_TIME_SECONDS)
      .optional(),
    chaptersUrl: optionalHttpOrHttpsUrl,
  })
  .strip();

export const queueSchema = z
  .array(audioEpisodeSchema)
  .max(MAX_QUEUE_ITEMS)
  .refine((queue) => new Set(queue.map((ep) => ep.id)).size === queue.length, {
    message: "Queue cannot contain duplicate episodes",
  });

export const savePlayerSessionSchema = z
  .object({
    episode: audioEpisodeSchema,
    currentTime: z.number().nonnegative().finite().max(MAX_TIME_SECONDS),
  })
  .strip();

export type AudioEpisode = z.infer<typeof audioEpisodeSchema>;

/**
 * Denormalized row shared by `userQueueItems` and `userPlayerSession`.
 * The compile-time `_QueueDenormInvariant` / `_SessionDenormInvariant`
 * assertions in `@/db/schema` guarantee these field sets stay aligned.
 */
export interface EpisodeDenormRow {
  episodeId: PodcastIndexEpisodeId;
  title: string;
  podcastTitle: string;
  audioUrl: string;
  artwork: string | null;
  duration: number | null;
  chaptersUrl: string | null;
}

export function toAudioEpisode(row: EpisodeDenormRow): AudioEpisode {
  const episode: AudioEpisode = {
    id: row.episodeId,
    title: row.title,
    podcastTitle: row.podcastTitle,
    audioUrl: row.audioUrl,
  };
  if (row.artwork != null) episode.artwork = row.artwork;
  if (row.duration != null) episode.duration = row.duration;
  if (row.chaptersUrl != null) episode.chaptersUrl = row.chaptersUrl;
  return episode;
}

/**
 * Reverse of `toAudioEpisode`: flattens an `AudioEpisode` into the
 * denormalized shape shared by `userQueueItems` and `userPlayerSession`.
 * Callers spread table-specific extras (`userId`, `position`, `currentTime`,
 * `updatedAt`) on top.
 */
export function toEpisodeDenormRow(ep: AudioEpisode): EpisodeDenormRow {
  return {
    episodeId: ep.id,
    title: ep.title,
    podcastTitle: ep.podcastTitle,
    audioUrl: ep.audioUrl,
    artwork: ep.artwork ?? null,
    duration: ep.duration ?? null,
    chaptersUrl: ep.chaptersUrl ?? null,
  };
}
