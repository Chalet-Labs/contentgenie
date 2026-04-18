import { z } from "zod";

const trimmedNonEmpty = z.string().trim().min(1).max(500);
const optionalUrl = z.url().max(2048).optional();

// Cap duration and currentTime at 1,000,000 seconds (~11.5 days). Keeps Zod
// rejections semantic rather than bubbling up from the decimal(12,3) column.
const MAX_TIME_SECONDS = 1_000_000;

export const audioEpisodeSchema = z
  .object({
    id: trimmedNonEmpty,
    title: trimmedNonEmpty,
    podcastTitle: trimmedNonEmpty,
    audioUrl: z.url().max(2048),
    artwork: optionalUrl,
    duration: z.number().nonnegative().finite().max(MAX_TIME_SECONDS).optional(),
    chaptersUrl: optionalUrl,
  })
  .strip();

export const queueSchema = z.array(audioEpisodeSchema).max(200);

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
  episodeId: string;
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
