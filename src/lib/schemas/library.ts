import { z } from "zod";

const trimmedNonEmpty = z.string().trim().min(1).max(500);
const optionalUrl = z.string().url().max(2048).optional();
const optionalText = z.string().max(5000).optional();
const optionalShortText = z.string().max(500).optional();

const podcastSchema = z
  .object({
    podcastIndexId: trimmedNonEmpty,
    title: trimmedNonEmpty,
    description: optionalText,
    publisher: optionalShortText,
    imageUrl: optionalUrl,
    rssFeedUrl: optionalUrl,
    categories: z.array(z.string().max(100)).max(50).optional(),
    totalEpisodes: z.number().int().nonnegative().finite().optional(),
  })
  .strip();

export const saveEpisodeSchema = z
  .object({
    podcastIndexId: trimmedNonEmpty,
    title: trimmedNonEmpty,
    description: optionalText,
    audioUrl: optionalUrl,
    duration: z.number().nonnegative().finite().optional(),
    publishDate: z.iso.datetime({ offset: true }).optional(),
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
    description: optionalText,
    publisher: optionalShortText,
    imageUrl: optionalUrl,
    rssFeedUrl: optionalUrl,
    categories: z.array(z.string().max(100)).max(50).optional(),
    totalEpisodes: z.number().int().nonnegative().finite().optional(),
    latestEpisodeDate: z.iso.datetime({ offset: true }).optional(),
  })
  .strip();

export const unsubscribeSchema = z
  .object({
    podcastIndexId: trimmedNonEmpty,
  })
  .strip();
