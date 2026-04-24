import { describe, it, expect } from "vitest";
import {
  cn,
  stripHtml,
  formatDate,
  formatDuration,
  slugify,
} from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
    expect(cn("base", true && "active")).toBe("base active");
  });

  it("resolves tailwind conflicts", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    expect(cn("mt-2", "mt-4")).toBe("mt-4");
  });

  it("handles empty and undefined inputs", () => {
    expect(cn("")).toBe("");
    expect(cn(undefined)).toBe("");
    expect(cn(null)).toBe("");
    expect(cn("foo", undefined, "bar")).toBe("foo bar");
  });

  it("handles array inputs", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("handles object inputs", () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
  });
});

describe("stripHtml", () => {
  it("strips HTML tags from a string", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("preserves plain text without tags", () => {
    expect(stripHtml("no tags here")).toBe("no tags here");
  });

  it("trims leading and trailing whitespace", () => {
    expect(stripHtml("  <p>spaced</p>  ")).toBe("spaced");
  });

  it("handles an empty string", () => {
    expect(stripHtml("")).toBe("");
  });

  it("strips self-closing tags", () => {
    expect(stripHtml("line<br/>break")).toBe("linebreak");
  });

  it("strips tags with attributes", () => {
    expect(stripHtml('<a href="https://example.com">link</a>')).toBe("link");
  });
});

describe("formatDuration", () => {
  it("formats seconds correctly", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(3600)).toBe("1h 0m");
    expect(formatDuration(3661)).toBe("1h 1m");
    expect(formatDuration(30)).toBe("0m");
  });

  it("handles null/undefined/0/negative", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration(0)).toBe("");
    expect(formatDuration(-10)).toBe("");
  });
});

describe("formatDate", () => {
  it("formats Date object", () => {
    const d = new Date("2023-10-05T12:00:00Z");
    const result = formatDate(d);
    // Since we can't guarantee timezone, checking parts is safer.
    expect(result).toMatch(/Oct/);
    expect(result).toMatch(/2023/);
  });

  it("formats string date", () => {
    const result = formatDate("2023-10-05T12:00:00Z");
    expect(result).toMatch(/Oct/);
    expect(result).toMatch(/2023/);
  });

  it("formats number (timestamp)", () => {
    const d = new Date("2023-10-05T12:00:00Z").getTime();
    const result = formatDate(d);
    expect(result).toMatch(/Oct/);
    expect(result).toMatch(/2023/);
  });

  it("handles null/undefined", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
  });
});

describe("slugify", () => {
  it("handles basic alphanumeric with special chars", () => {
    expect(slugify("AI Models & Capabilities")).toBe("ai-models-capabilities");
  });

  it("handles slashes and em-dashes", () => {
    expect(slugify("Crypto/Blockchain — On-chain")).toBe(
      "crypto-blockchain-on-chain",
    );
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(slugify("   ")).toBe("");
  });

  it("returns empty string for all-punctuation input", () => {
    expect(slugify("!!!")).toBe("");
  });

  it("strips diacritics via NFKD normalization", () => {
    expect(slugify("Café Français")).toBe("cafe-francais");
  });

  it("strips diacritics on mixed accent chars", () => {
    expect(slugify("Naïve résumé")).toBe("naive-resume");
  });

  it("trims and collapses whitespace", () => {
    expect(slugify("  Hello  World  ")).toBe("hello-world");
  });

  it("collapses runs of non-alnum to single hyphen", () => {
    expect(slugify("a--b---c")).toBe("a-b-c");
  });

  it("is idempotent on already-slugged input", () => {
    expect(slugify("already-slugged")).toBe("already-slugged");
  });

  it("handles underscores and mixed case with digits", () => {
    expect(slugify("UPPER_case_123")).toBe("upper-case-123");
  });

  it("is idempotent for all non-empty samples", () => {
    const samples = [
      "AI Models & Capabilities",
      "Crypto/Blockchain — On-chain",
      "Café Français",
      "Naïve résumé",
      "  Hello  World  ",
      "a--b---c",
      "already-slugged",
      "UPPER_case_123",
    ];
    for (const s of samples) {
      const once = slugify(s);
      if (once !== "") {
        expect(slugify(once)).toBe(once);
      }
    }
  });
});
