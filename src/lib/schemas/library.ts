import { z } from "zod";

const trimmedNonEmpty = z.string().trim().min(1);

const podcastSchema = z
  .object({
    podcastIndexId: trimmedNonEmpty,
    title: trimmedNonEmpty,
    description: z.string().optional(),
    publisher: z.string().optional(),
    imageUrl: z.string().optional(),
    rssFeedUrl: z.string().optional(),
    categories: z.array(z.string()).optional(),
    totalEpisodes: z.number().finite().optional(),
  })
  .strip();

export const saveEpisodeSchema = z
  .object({
    podcastIndexId: trimmedNonEmpty,
    title: trimmedNonEmpty,
    description: z.string().optional(),
    audioUrl: z.string().optional(),
    duration: z.number().finite().optional(),
    publishDate: z.string().optional(),
    podcast: podcastSchema,
  })
  .strip();

export const unsaveEpisodeSchema = z
  .object({
    podcastIndexId: trimmedNonEmpty,
  })
  .strip();

export const subscribeSchema = z
  .object({
    podcastIndexId: trimmedNonEmpty,
    title: trimmedNonEmpty,
    description: z.string().optional(),
    publisher: z.string().optional(),
    imageUrl: z.string().optional(),
    rssFeedUrl: z.string().optional(),
    categories: z.array(z.string()).optional(),
    totalEpisodes: z.number().optional(),
    latestEpisodeDate: z.string().optional(),
  })
  .strip();

export const unsubscribeSchema = z
  .object({
    podcastIndexId: trimmedNonEmpty,
  })
  .strip();
