import Parser from "rss-parser";

export interface ParsedEpisode {
  title: string;
  description: string | null;
  audioUrl: string | null;
  guid: string;
  publishDate: Date | null;
  duration: number | null;
}

export interface ParsedFeed {
  title: string;
  description: string | null;
  author: string | null;
  imageUrl: string | null;
  link: string | null;
  feedUrl: string;
  episodes: ParsedEpisode[];
}

const parser = new Parser({
  customFields: {
    feed: ["itunes:author", "itunes:image"],
    item: ["itunes:duration"],
  },
});

/**
 * Parse an iTunes-style duration string or numeric seconds into an integer
 * number of seconds. Returns null for missing or unparseable values.
 */
export function parseDuration(
  raw: string | number | undefined | null,
): number | null {
  if (raw == null || raw === "") return null;

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.round(raw) : null;
  }

  // Try numeric string first (e.g. "3600")
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && !/:/.test(raw)) {
    return Math.round(asNumber);
  }

  // Parse HH:MM:SS or MM:SS
  const parts = raw.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  return null;
}

function parseEpisodeItem(
  item: Record<string, unknown>,
): ParsedEpisode {
  const enclosure = item.enclosure as { url?: string } | undefined;
  const pubDate = item.pubDate as string | undefined;
  const publishDate = pubDate ? new Date(pubDate) : null;

  return {
    title: (item.title as string) ?? "Untitled Episode",
    description:
      (item.contentSnippet as string) ?? (item.content as string) ?? null,
    audioUrl: enclosure?.url ?? null,
    guid:
      (item.guid as string) ??
      (item.link as string) ??
      (item.title as string) ??
      "",
    publishDate:
      publishDate && !isNaN(publishDate.getTime()) ? publishDate : null,
    duration: parseDuration(
      item["itunes:duration"] as string | undefined,
    ),
  };
}

/**
 * Fetch and parse an RSS feed URL, returning typed podcast metadata and
 * episode list.
 */
export async function parsePodcastFeed(feedUrl: string): Promise<ParsedFeed> {
  let feed: Record<string, unknown>;

  try {
    feed = await parser.parseURL(feedUrl) as unknown as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to parse RSS feed at ${feedUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const image = feed.image as { url?: string } | undefined;
  const imageHref =
    image?.url ?? (feed["itunes:image"] as string | undefined) ?? null;

  return {
    title: (feed.title as string) ?? "Untitled Podcast",
    description: (feed.description as string) ?? null,
    author:
      (feed["itunes:author"] as string | undefined) ??
      (feed.creator as string | undefined) ??
      null,
    imageUrl: typeof imageHref === "string" ? imageHref : null,
    link: (feed.link as string) ?? null,
    feedUrl,
    episodes: ((feed.items as Record<string, unknown>[]) ?? []).map(
      parseEpisodeItem,
    ),
  };
}
