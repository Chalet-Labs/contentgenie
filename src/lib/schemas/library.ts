import { z } from "zod";

/** Shared max-length for short user text (notes, descriptions, etc.). */
export const MAX_SHORT_TEXT = 500;

const trimmedNonEmpty = z.string().trim().min(1).max(MAX_SHORT_TEXT);
const optionalUrl = z
  .union([z.url().max(2048), z.literal("")])
  .optional()
  .transform((val) => (val === "" ? undefined : val));
const optionalText = z.string().max(5000).optional();
const optionalShortText = z.string().max(MAX_SHORT_TEXT).optional();

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

export const subscribeSchema = podcastSchema
  .extend({
    latestEpisodeDate: z.iso.datetime({ offset: true }).optional(),
  })
  .strip();

export const unsubscribeSchema = z
  .object({
    podcastIndexId: trimmedNonEmpty,
  })
  .strip();

/** Parse an ISO datetime string into a Date, returning undefined on invalid input. */
export function safeParseDate(value: string | null | undefined): Date | undefined {
  if (value == null) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}
