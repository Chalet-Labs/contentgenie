import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/security", () => ({
  safeFetch: vi.fn(),
}));

import {
  extractTranscriptUrl,
  fetchTranscriptFromUrl,
  fetchTranscript,
  stripVttTimestamps,
  stripHtmlTranscript,
  normalizeTranscriptContent,
} from "@/trigger/helpers/transcript";
import { safeFetch } from "@/lib/security";

describe("extractTranscriptUrl", () => {
  it("extracts URL after 'Transcript:' with newline", () => {
    expect(extractTranscriptUrl("Transcript:\nhttps://example.com/t")).toBe(
      "https://example.com/t"
    );
  });

  it("extracts URL after 'Full transcript:'", () => {
    expect(extractTranscriptUrl("Full transcript: https://example.com/t")).toBe(
      "https://example.com/t"
    );
  });

  it("extracts URL after 'Transcript available:'", () => {
    expect(
      extractTranscriptUrl("Transcript available: https://example.com/t")
    ).toBe("https://example.com/t");
  });

  it("extracts URL with plural 'Transcripts:'", () => {
    expect(extractTranscriptUrl("Transcripts: https://example.com/t")).toBe(
      "https://example.com/t"
    );
  });

  it("strips HTML tags and extracts URL from HTML description", () => {
    const html =
      "<p>Transcript: <a href='https://example.com/t'>https://example.com/t</a></p>";
    expect(extractTranscriptUrl(html)).toBe("https://example.com/t");
  });

  it("returns null for empty string", () => {
    expect(extractTranscriptUrl("")).toBeNull();
  });

  it("returns null when no transcript keyword present", () => {
    expect(extractTranscriptUrl("No link here")).toBeNull();
  });

  it("returns null for URL without transcript keyword", () => {
    expect(extractTranscriptUrl("Check out https://example.com")).toBeNull();
  });
});

describe("fetchTranscriptFromUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns text content on success", async () => {
    vi.mocked(safeFetch).mockResolvedValue("This is transcript text.");

    const result = await fetchTranscriptFromUrl("https://example.com/t");

    expect(result).toBe("This is transcript text.");
    expect(safeFetch).toHaveBeenCalledWith(
      "https://example.com/t",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("strips HTML tags from HTML response", async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      "<!DOCTYPE html><html><body><p>Hello world</p></body></html>"
    );

    const result = await fetchTranscriptFromUrl("https://example.com/t");

    expect(result).not.toContain("<");
    expect(result).toContain("Hello world");
  });

  it("truncates content exceeding MAX_TRANSCRIPT_LENGTH", async () => {
    const longContent = "a".repeat(60000);
    vi.mocked(safeFetch).mockResolvedValue(longContent);

    const result = await fetchTranscriptFromUrl("https://example.com/t");

    expect(result).toBeDefined();
    expect(result!.length).toBeLessThan(longContent.length);
    expect(result).toContain("[Transcript truncated...]");
  });

  it("throws on fetch error", async () => {
    vi.mocked(safeFetch).mockRejectedValue(new Error("Network error"));

    await expect(fetchTranscriptFromUrl("https://example.com/t")).rejects.toThrow(
      "Network error"
    );
  });

  it("returns undefined for empty response", async () => {
    vi.mocked(safeFetch).mockResolvedValue("   ");

    const result = await fetchTranscriptFromUrl("https://example.com/t");

    expect(result).toBeUndefined();
  });
});

describe("stripVttTimestamps", () => {
  it("removes WEBVTT header and returns cue text only", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:00:05.000 --> 00:00:08.000
This is a test`;
    const result = stripVttTimestamps(vtt);
    expect(result).toBe("Hello world\nThis is a test");
    expect(result).not.toContain("WEBVTT");
    expect(result).not.toContain("-->");
  });

  it("removes WEBVTT header with multiple metadata lines", () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

00:00:01.000 --> 00:00:04.000
Hello world`;
    const result = stripVttTimestamps(vtt);
    expect(result).toBe("Hello world");
    expect(result).not.toContain("Kind");
    expect(result).not.toContain("Language");
  });

  it("preserves numeric-only transcript lines that aren't cue IDs", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
The answer is
100`;
    const result = stripVttTimestamps(vtt);
    expect(result).toContain("100");
  });

  it("removes NOTE blocks entirely", () => {
    const vtt = `WEBVTT

NOTE This is a comment

00:00:01.000 --> 00:00:04.000
Actual content`;
    const result = stripVttTimestamps(vtt);
    expect(result).toBe("Actual content");
    expect(result).not.toContain("NOTE");
    expect(result).not.toContain("comment");
  });

  it("removes STYLE blocks entirely", () => {
    const vtt = `WEBVTT

STYLE
::cue { color: red; }

00:00:01.000 --> 00:00:04.000
Styled text`;
    const result = stripVttTimestamps(vtt);
    expect(result).toBe("Styled text");
    expect(result).not.toContain("STYLE");
    expect(result).not.toContain("color");
  });

  it("removes REGION blocks entirely", () => {
    const vtt = `WEBVTT

REGION
id:left
width:40%

00:00:01.000 --> 00:00:04.000
Region text`;
    const result = stripVttTimestamps(vtt);
    expect(result).toBe("Region text");
    expect(result).not.toContain("REGION");
    expect(result).not.toContain("width");
  });

  it("removes inline tags like <v>, <c>, <b>, <i>, <u> but preserves text", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v Alice>Hello <b>world</b></v>

00:00:05.000 --> 00:00:08.000
<c>Some</c> <i>italic</i> <u>text</u>`;
    const result = stripVttTimestamps(vtt);
    expect(result).toContain("Hello world");
    expect(result).toContain("Some italic text");
    expect(result).not.toContain("<v");
    expect(result).not.toContain("<b>");
    expect(result).not.toContain("<c>");
    expect(result).not.toContain("<i>");
    expect(result).not.toContain("<u>");
  });

  it("removes numeric cue identifiers", () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
First cue

2
00:00:05.000 --> 00:00:08.000
Second cue`;
    const result = stripVttTimestamps(vtt);
    expect(result).toBe("First cue\nSecond cue");
    expect(result).not.toMatch(/^\d+$/m);
  });

  it("removes timing lines with position/alignment settings", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000 align:start position:0%
Positioned text

00:00:05.000 --> 00:00:08.000 line:80%
Line-positioned text`;
    const result = stripVttTimestamps(vtt);
    expect(result).toBe("Positioned text\nLine-positioned text");
    expect(result).not.toContain("align:");
    expect(result).not.toContain("line:");
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(stripVttTimestamps("")).toBe("");
    expect(stripVttTimestamps("   \n  \n  ")).toBe("");
  });

  it("removes VTT timestamp tags like <00:01:02.345>", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:10.000
Hello <00:00:03.500>world <00:00:06.000>goodbye`;
    const result = stripVttTimestamps(vtt);
    expect(result).toBe("Hello world goodbye");
    expect(result).not.toContain("<00:");
  });

  it("removes short-form timestamps without hours (MM:SS.mmm)", () => {
    const vtt = `WEBVTT

01:30.000 --> 02:00.000
Short form speech

00:00:05.000 --> 00:00:08.000
Long form speech`;
    const result = stripVttTimestamps(vtt);
    expect(result).toBe("Short form speech\nLong form speech");
    expect(result).not.toContain("-->");
  });

  it("preserves multi-line cue text", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
First line of the cue
second line of the cue

00:00:05.000 --> 00:00:08.000
Another cue`;
    const result = stripVttTimestamps(vtt);
    expect(result).toContain("First line of the cue\nsecond line of the cue");
    expect(result).toContain("Another cue");
  });

  it("strips unknown HTML-like tags from VTT cue text", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello <iframe>injected</iframe> world`;
    const result = stripVttTimestamps(vtt);
    expect(result).toBe("Hello injected world");
    expect(result).not.toContain("<iframe");
  });

  it("removes short-form inline timestamp tags", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:10.000
Hello <01:30.500>world`;
    const result = stripVttTimestamps(vtt);
    expect(result).toBe("Hello world");
  });
});

describe("stripHtmlTranscript", () => {
  it("extracts text from simple paragraph tags", () => {
    const html = "<p>Hello</p><p>World</p>";
    const result = stripHtmlTranscript(html);
    expect(result).toContain("Hello");
    expect(result).toContain("World");
    expect(result).not.toContain("<p>");
  });

  it("removes script and style blocks including their content", () => {
    const html = `<html><body>
<script>alert('xss')</script>
<style>body { color: red; }</style>
<p>Transcript text here</p>
</body></html>`;
    const result = stripHtmlTranscript(html);
    expect(result).toContain("Transcript text here");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("color: red");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("<style");
  });

  it("handles script/style end tags with whitespace before >", () => {
    const html = "<script>malicious()</script ><style>h1{}</style ><p>Content</p>";
    const result = stripHtmlTranscript(html);
    expect(result).not.toContain("malicious");
    expect(result).not.toContain("h1{}");
    expect(result).toContain("Content");
  });

  it("decodes HTML entities", () => {
    const html = "<p>Rock &amp; Roll &mdash; it&#39;s great</p>";
    const result = stripHtmlTranscript(html);
    expect(result).toContain("Rock & Roll");
    expect(result).toContain("—");
    expect(result).toContain("it's great");
    expect(result).not.toContain("&amp;");
    expect(result).not.toContain("&mdash;");
    expect(result).not.toContain("&#39;");
  });

  it("strips entity-encoded tags that survive initial tag removal", () => {
    const html = "<p>Safe text &lt;b&gt;bold&lt;/b&gt; end</p>";
    const result = stripHtmlTranscript(html);
    expect(result).toContain("Safe text");
    expect(result).toContain("bold");
    expect(result).toContain("end");
    expect(result).not.toContain("<b");
    expect(result).not.toContain("&lt;");
  });

  it("strips a full HTML document leaving only text content", () => {
    const html = `<!DOCTYPE html>
<html>
<head><title>Episode Transcript</title></head>
<body>
<nav><a href="/">Home</a></nav>
<main>
  <h1>Episode 42</h1>
  <p>Welcome to the show.</p>
  <p>Today we discuss AI.</p>
</main>
<footer>Copyright 2026</footer>
</body>
</html>`;
    const result = stripHtmlTranscript(html);
    expect(result).toContain("Episode 42");
    expect(result).toContain("Welcome to the show.");
    expect(result).toContain("Today we discuss AI.");
    expect(result).not.toContain("<html");
    expect(result).not.toContain("<nav");
    expect(result).not.toContain("<head");
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(stripHtmlTranscript("")).toBe("");
    expect(stripHtmlTranscript("   ")).toBe("");
  });
});

describe("normalizeTranscriptContent", () => {
  it("dispatches to stripVttTimestamps for text/vtt", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
VTT content`;
    const result = normalizeTranscriptContent(vtt, "text/vtt");
    expect(result).toBe("VTT content");
    expect(result).not.toContain("WEBVTT");
  });

  it("dispatches to stripHtmlTranscript for text/html", () => {
    const html = "<p>HTML content &amp; more</p>";
    const result = normalizeTranscriptContent(html, "text/html");
    expect(result).toContain("HTML content & more");
    expect(result).not.toContain("<p>");
  });

  it("returns raw string unchanged for text/plain", () => {
    const plain = "Plain text transcript.";
    expect(normalizeTranscriptContent(plain, "text/plain")).toBe(plain);
  });

  it("returns raw string unchanged for application/srt", () => {
    const srt = "1\n00:00:01,000 --> 00:00:04,000\nSRT line";
    expect(normalizeTranscriptContent(srt, "application/srt")).toBe(srt);
  });

  it("returns raw string unchanged for unknown MIME types", () => {
    const raw = "some unknown format content";
    expect(normalizeTranscriptContent(raw, "application/unknown")).toBe(raw);
  });
});

describe("fetchTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined when no transcripts", async () => {
    const result = await fetchTranscript({ transcripts: [] });
    expect(result).toBeUndefined();
  });

  it("returns undefined when no supported transcript type", async () => {
    const result = await fetchTranscript({
      transcripts: [{ type: "audio/mpeg", url: "https://example.com/audio.mp3" }],
    });
    expect(result).toBeUndefined();
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it("prefers text/plain over all other types", async () => {
    vi.mocked(safeFetch).mockResolvedValue("Plain text content");
    const result = await fetchTranscript({
      transcripts: [
        { type: "text/html", url: "https://example.com/t.html" },
        { type: "text/plain", url: "https://example.com/t.txt" },
        { type: "text/vtt", url: "https://example.com/t.vtt" },
      ],
    });
    expect(safeFetch).toHaveBeenCalledWith(
      "https://example.com/t.txt",
      expect.anything()
    );
    expect(result).toBe("Plain text content");
  });

  it("falls back to text/vtt when text/plain and application/srt unavailable", async () => {
    vi.mocked(safeFetch).mockResolvedValue(`WEBVTT

00:00:01.000 --> 00:00:04.000
VTT speech`);
    const result = await fetchTranscript({
      transcripts: [
        { type: "text/vtt", url: "https://example.com/t.vtt" },
        { type: "text/html", url: "https://example.com/t.html" },
      ],
    });
    expect(safeFetch).toHaveBeenCalledWith(
      "https://example.com/t.vtt",
      expect.anything()
    );
    expect(result).toBe("VTT speech");
    expect(result).not.toContain("WEBVTT");
  });

  it("falls back to text/html when only HTML available", async () => {
    vi.mocked(safeFetch).mockResolvedValue("<p>HTML transcript</p>");
    const result = await fetchTranscript({
      transcripts: [{ type: "text/html", url: "https://example.com/t.html" }],
    });
    expect(safeFetch).toHaveBeenCalledWith(
      "https://example.com/t.html",
      expect.anything()
    );
    expect(result).toContain("HTML transcript");
    expect(result).not.toContain("<p>");
  });

  it("applies VTT normalization when fetching text/vtt", async () => {
    vi.mocked(safeFetch).mockResolvedValue(`WEBVTT

1
00:00:01.000 --> 00:00:04.000
<v Speaker>Normalized speech</v>`);
    const result = await fetchTranscript({
      transcripts: [{ type: "text/vtt", url: "https://example.com/t.vtt" }],
    });
    expect(result).toBe("Normalized speech");
  });

  it("applies HTML normalization when fetching text/html", async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      "<html><body><script>bad()</script><p>Clean text &amp; more</p></body></html>"
    );
    const result = await fetchTranscript({
      transcripts: [{ type: "text/html", url: "https://example.com/t.html" }],
    });
    expect(result).toContain("Clean text & more");
    expect(result).not.toContain("bad()");
    expect(result).not.toContain("<p>");
  });

  it("does not normalize text/plain content (existing behavior preserved)", async () => {
    const plain = "  Raw   plain   text  ";
    vi.mocked(safeFetch).mockResolvedValue(plain);
    const result = await fetchTranscript({
      transcripts: [{ type: "text/plain", url: "https://example.com/t.txt" }],
    });
    // trim() is applied but otherwise passthrough
    expect(result).toBe("Raw   plain   text");
  });

  it("returns undefined when fetched transcript is empty after normalization", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(safeFetch).mockResolvedValue("WEBVTT\n\n");
    const result = await fetchTranscript({
      transcripts: [{ type: "text/vtt", url: "https://example.com/t.vtt" }],
    });
    expect(result).toBeUndefined();
    warnSpy.mockRestore();
  });

  it("prefers application/srt over text/vtt", async () => {
    vi.mocked(safeFetch).mockResolvedValue("1\n00:00:01,000 --> 00:00:04,000\nSRT content");
    const result = await fetchTranscript({
      transcripts: [
        { type: "text/vtt", url: "https://example.com/t.vtt" },
        { type: "application/srt", url: "https://example.com/t.srt" },
      ],
    });
    expect(safeFetch).toHaveBeenCalledWith(
      "https://example.com/t.srt",
      expect.anything()
    );
    expect(result).toContain("SRT content");
  });

  it("logs warning when normalization produces empty output from non-empty content", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(safeFetch).mockResolvedValue("WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n\n");
    await fetchTranscript({
      transcripts: [{ type: "text/vtt", url: "https://example.com/t.vtt" }],
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[fetchTranscript] Normalization produced empty output",
      expect.objectContaining({ type: "text/vtt", url: "https://example.com/t.vtt" })
    );
    warnSpy.mockRestore();
  });
});
