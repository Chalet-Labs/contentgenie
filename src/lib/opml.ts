import { XMLParser } from "fast-xml-parser";

export interface OpmlFeed {
  title?: string;
  feedUrl: string;
  htmlUrl?: string;
}

interface OpmlOutline {
  "@_type"?: string;
  "@_xmlUrl"?: string;
  "@_text"?: string;
  "@_title"?: string;
  "@_htmlUrl"?: string;
  outline?: OpmlOutline | OpmlOutline[];
}

/**
 * Recursively extract feed URLs from nested OPML outline elements.
 * Outlines can be nested arbitrarily deep (folders / categories).
 */
function extractFeeds(outline: OpmlOutline | OpmlOutline[]): OpmlFeed[] {
  const outlines = Array.isArray(outline) ? outline : [outline];
  const feeds: OpmlFeed[] = [];

  for (const item of outlines) {
    if (typeof item !== "object" || item === null) continue;

    const xmlUrl = item["@_xmlUrl"];
    if (typeof xmlUrl === "string" && xmlUrl.trim()) {
      feeds.push({
        title: item["@_text"] || item["@_title"] || undefined,
        feedUrl: xmlUrl.trim(),
        htmlUrl: item["@_htmlUrl"] || undefined,
      });
    }

    // Recurse into nested outlines (folders)
    if (item.outline) {
      feeds.push(...extractFeeds(item.outline));
    }
  }

  return feeds;
}

/**
 * Parse an OPML XML string into a flat array of feed URLs.
 *
 * Supports nested outlines (folders), deduplicates by feed URL,
 * and validates that at least one feed URL is present.
 *
 * @throws {Error} If the XML is invalid, not OPML, or contains no feeds.
 */
export function parseOpml(xmlString: string): OpmlFeed[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
    allowBooleanAttributes: true,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xmlString);
  } catch {
    throw new Error("Invalid XML: the file could not be parsed");
  }

  const opml = parsed.opml as Record<string, unknown> | undefined;
  if (!opml) {
    throw new Error("Invalid OPML: missing <opml> root element");
  }

  const body = opml.body;
  if (body === undefined || body === null) {
    throw new Error("Invalid OPML: missing <body> element");
  }

  // An empty <body></body> is parsed as "" by fast-xml-parser
  if (typeof body !== "object") {
    throw new Error("No feeds found in OPML file");
  }

  const outline = (body as Record<string, unknown>).outline as
    | OpmlOutline
    | OpmlOutline[]
    | undefined;
  if (!outline) {
    throw new Error("No feeds found in OPML file");
  }

  const feeds = extractFeeds(outline);

  if (feeds.length === 0) {
    throw new Error("No feeds found in OPML file");
  }

  // Deduplicate by feed URL (case-sensitive, first occurrence wins)
  const seen = new Set<string>();
  const unique: OpmlFeed[] = [];
  for (const feed of feeds) {
    if (!seen.has(feed.feedUrl)) {
      seen.add(feed.feedUrl);
      unique.push(feed);
    }
  }

  return unique;
}
