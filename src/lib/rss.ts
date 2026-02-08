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

interface CustomItem {
  "itunes:duration"?: string;
}

const parser = new Parser<Record<string, never>, CustomItem>({
  customFields: {
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
    return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  if (parts.length === 2) {
    return Math.round(parts[0] * 60 + parts[1]);
  }

  return null;
}

function parseEpisodeItem(
  item: Parser.Item & CustomItem,
): ParsedEpisode {
  const publishDate = item.pubDate ? new Date(item.pubDate) : null;
  const guid =
    item.guid ?? item.link ?? item.enclosure?.url ?? undefined;

  if (!guid) {
    throw new Error(
      `Could not determine a unique identifier for episode: ${JSON.stringify(item).substring(0, 200)}`,
    );
  }

  return {
    title: item.title ?? "Untitled Episode",
    description: item.contentSnippet ?? item.content ?? null,
    audioUrl: item.enclosure?.url ?? null,
    guid,
    publishDate:
      publishDate && !isNaN(publishDate.getTime()) ? publishDate : null,
    duration: parseDuration(item["itunes:duration"]),
  };
}

/**
 * Fetch and parse an RSS feed URL, returning typed podcast metadata and
 * episode list.
 */
export async function parsePodcastFeed(feedUrl: string): Promise<ParsedFeed> {
  let feed: Parser.Output<CustomItem>;

  try {
    feed = await parser.parseURL(feedUrl);
  } catch (error) {
    throw new Error(
      `Failed to parse RSS feed at ${feedUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    title: feed.title ?? "Untitled Podcast",
    description: feed.description ?? null,
    author: feed.itunes?.author ?? null,
    imageUrl: feed.image?.url ?? feed.itunes?.image ?? null,
    link: feed.link ?? null,
    feedUrl,
    episodes: (feed.items ?? []).map(parseEpisodeItem),
  };
}
