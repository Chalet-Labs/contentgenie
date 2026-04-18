import { z } from "zod";

const trimmedNonEmpty = z.string().trim().min(1).max(500);
const optionalUrl = z.url().max(2048).optional();

export const audioEpisodeSchema = z
  .object({
    id: trimmedNonEmpty,
    title: trimmedNonEmpty,
    podcastTitle: trimmedNonEmpty,
    audioUrl: z.url().max(2048),
    artwork: optionalUrl,
    duration: z.number().nonnegative().finite().optional(),
    chaptersUrl: optionalUrl,
  })
  .strip();

export const queueSchema = z.array(audioEpisodeSchema).max(200);

export const savePlayerSessionSchema = z
  .object({
    episode: audioEpisodeSchema,
    currentTime: z.number().nonnegative().finite(),
  })
  .strip();
