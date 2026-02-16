import { describe, it, expect } from "vitest";
import { parseOpml, type OpmlFeed } from "@/lib/opml";

const VALID_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My Podcasts</title></head>
  <body>
    <outline type="rss" text="Podcast A" xmlUrl="https://a.com/feed.xml" htmlUrl="https://a.com" />
    <outline type="rss" text="Podcast B" xmlUrl="https://b.com/rss" />
  </body>
</opml>`;

const NESTED_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Nested</title></head>
  <body>
    <outline text="Tech">
      <outline type="rss" text="Tech Pod 1" xmlUrl="https://tech1.com/feed" />
      <outline type="rss" text="Tech Pod 2" xmlUrl="https://tech2.com/feed" />
    </outline>
    <outline text="News">
      <outline type="rss" text="News Pod" xmlUrl="https://news.com/feed" />
    </outline>
    <outline type="rss" text="Top Level" xmlUrl="https://top.com/feed" />
  </body>
</opml>`;

const DEEPLY_NESTED_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Deep</title></head>
  <body>
    <outline text="Level 1">
      <outline text="Level 2">
        <outline type="rss" text="Deep Pod" xmlUrl="https://deep.com/feed" />
      </outline>
    </outline>
  </body>
</opml>`;

const DUPLICATE_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Dupes</title></head>
  <body>
    <outline type="rss" text="Pod A" xmlUrl="https://a.com/feed" />
    <outline type="rss" text="Pod A Copy" xmlUrl="https://a.com/feed" />
    <outline type="rss" text="Pod B" xmlUrl="https://b.com/feed" />
  </body>
</opml>`;

const TITLE_ATTR_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Title attr</title></head>
  <body>
    <outline type="rss" title="Via Title" xmlUrl="https://title.com/feed" />
  </body>
</opml>`;

const NO_TITLE_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>No Title</title></head>
  <body>
    <outline type="rss" xmlUrl="https://notitle.com/feed" />
  </body>
</opml>`;

describe("parseOpml", () => {
  it("parses a valid flat OPML file", () => {
    const feeds = parseOpml(VALID_OPML);
    expect(feeds).toHaveLength(2);
    expect(feeds[0]).toEqual({
      title: "Podcast A",
      feedUrl: "https://a.com/feed.xml",
      htmlUrl: "https://a.com",
    });
    expect(feeds[1]).toEqual({
      title: "Podcast B",
      feedUrl: "https://b.com/rss",
      htmlUrl: undefined,
    });
  });

  it("parses nested OPML outlines (folders)", () => {
    const feeds = parseOpml(NESTED_OPML);
    expect(feeds).toHaveLength(4);
    const urls = feeds.map((f: OpmlFeed) => f.feedUrl);
    expect(urls).toContain("https://tech1.com/feed");
    expect(urls).toContain("https://tech2.com/feed");
    expect(urls).toContain("https://news.com/feed");
    expect(urls).toContain("https://top.com/feed");
  });

  it("parses deeply nested outlines", () => {
    const feeds = parseOpml(DEEPLY_NESTED_OPML);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].feedUrl).toBe("https://deep.com/feed");
    expect(feeds[0].title).toBe("Deep Pod");
  });

  it("deduplicates by feed URL", () => {
    const feeds = parseOpml(DUPLICATE_OPML);
    expect(feeds).toHaveLength(2);
    // First occurrence wins
    expect(feeds[0].title).toBe("Pod A");
    expect(feeds[1].feedUrl).toBe("https://b.com/feed");
  });

  it("uses title attribute when text is missing", () => {
    const feeds = parseOpml(TITLE_ATTR_OPML);
    expect(feeds[0].title).toBe("Via Title");
  });

  it("handles outlines without title or text", () => {
    const feeds = parseOpml(NO_TITLE_OPML);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].title).toBeUndefined();
    expect(feeds[0].feedUrl).toBe("https://notitle.com/feed");
  });

  it("skips outlines without xmlUrl", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Mixed</title></head>
  <body>
    <outline text="Folder only" />
    <outline type="rss" text="No URL" />
    <outline type="rss" text="Has URL" xmlUrl="https://valid.com/feed" />
  </body>
</opml>`;
    const feeds = parseOpml(opml);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].feedUrl).toBe("https://valid.com/feed");
  });

  it("throws on invalid XML (non-OPML content)", () => {
    expect(() => parseOpml("not xml at all {{{")).toThrow("missing <opml> root element");
  });

  it("throws on missing <opml> root element", () => {
    const xml = `<?xml version="1.0"?><html><body>not opml</body></html>`;
    expect(() => parseOpml(xml)).toThrow("missing <opml> root element");
  });

  it("throws on missing <body> element", () => {
    const xml = `<?xml version="1.0"?><opml version="2.0"><head><title>T</title></head></opml>`;
    expect(() => parseOpml(xml)).toThrow("missing <body> element");
  });

  it("throws on empty body (no outlines)", () => {
    const xml = `<?xml version="1.0"?><opml version="2.0"><head><title>T</title></head><body></body></opml>`;
    expect(() => parseOpml(xml)).toThrow("No feeds found");
  });

  it("throws when all outlines are folders without feed URLs", () => {
    const xml = `<?xml version="1.0"?>
<opml version="2.0">
  <head><title>T</title></head>
  <body>
    <outline text="Folder 1" />
    <outline text="Folder 2" />
  </body>
</opml>`;
    expect(() => parseOpml(xml)).toThrow("No feeds found");
  });

  it("trims whitespace from feed URLs", () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <head><title>T</title></head>
  <body>
    <outline type="rss" text="Trimmed" xmlUrl="  https://trim.com/feed  " />
  </body>
</opml>`;
    const feeds = parseOpml(opml);
    expect(feeds[0].feedUrl).toBe("https://trim.com/feed");
  });

  it("handles single outline (non-array)", () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <head><title>T</title></head>
  <body>
    <outline type="rss" text="Only One" xmlUrl="https://one.com/feed" />
  </body>
</opml>`;
    const feeds = parseOpml(opml);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].title).toBe("Only One");
  });
});
