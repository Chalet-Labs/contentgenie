import { describe, it, expect } from "vitest";
import { parseChapters, type Chapter } from "@/lib/chapters";

describe("parseChapters", () => {
  it("parses valid chapters JSON", () => {
    const input = {
      version: "1.2.0",
      chapters: [
        { startTime: 0, title: "Introduction" },
        { startTime: 60, title: "Main Topic" },
        { startTime: 300, title: "Conclusion" },
      ],
    };

    const result = parseChapters(input);

    expect(result).toEqual([
      { startTime: 0, title: "Introduction" },
      { startTime: 60, title: "Main Topic" },
      { startTime: 300, title: "Conclusion" },
    ]);
  });

  it("generates fallback title for entries missing a title", () => {
    const input = {
      chapters: [
        { startTime: 0 },
        { startTime: 60, title: "Has Title" },
        { startTime: 120, title: "" },
      ],
    };

    const result = parseChapters(input);

    expect(result).toEqual([
      { startTime: 0, title: "Chapter 1" },
      { startTime: 60, title: "Has Title" },
      { startTime: 120, title: "Chapter 3" },
    ]);
  });

  it("skips entries missing startTime", () => {
    const input = {
      chapters: [
        { title: "No start time" },
        { startTime: 10, title: "Valid" },
        { startTime: "not a number", title: "Bad type" },
      ],
    };

    const result = parseChapters(input);

    expect(result).toEqual([{ startTime: 10, title: "Valid" }]);
  });

  it("skips entries with non-finite startTime", () => {
    const input = {
      chapters: [
        { startTime: NaN, title: "NaN" },
        { startTime: Infinity, title: "Infinity" },
        { startTime: 5, title: "Valid" },
      ],
    };

    const result = parseChapters(input);

    expect(result).toEqual([{ startTime: 5, title: "Valid" }]);
  });

  it("skips entries with negative startTime", () => {
    const input = {
      chapters: [
        { startTime: -10, title: "Negative" },
        { startTime: -0.5, title: "Slightly negative" },
        { startTime: 0, title: "Zero" },
        { startTime: 5, title: "Positive" },
      ],
    };

    const result = parseChapters(input);

    expect(result).toEqual([
      { startTime: 0, title: "Zero" },
      { startTime: 5, title: "Positive" },
    ]);
  });

  it("filters out chapters with toc: false", () => {
    const input = {
      chapters: [
        { startTime: 0, title: "Visible" },
        { startTime: 30, title: "Hidden", toc: false },
        { startTime: 60, title: "Also visible", toc: true },
      ],
    };

    const result = parseChapters(input);

    expect(result).toEqual([
      { startTime: 0, title: "Visible" },
      { startTime: 60, title: "Also visible" },
    ]);
  });

  it("sorts unsorted chapters by startTime", () => {
    const input = {
      chapters: [
        { startTime: 300, title: "Third" },
        { startTime: 0, title: "First" },
        { startTime: 120, title: "Second" },
      ],
    };

    const result = parseChapters(input);

    expect(result).toEqual([
      { startTime: 0, title: "First" },
      { startTime: 120, title: "Second" },
      { startTime: 300, title: "Third" },
    ]);
  });

  it("returns empty array for completely invalid JSON", () => {
    expect(parseChapters(null)).toEqual([]);
    expect(parseChapters(undefined)).toEqual([]);
    expect(parseChapters("string")).toEqual([]);
    expect(parseChapters(42)).toEqual([]);
    expect(parseChapters(true)).toEqual([]);
  });

  it("returns empty array for object without chapters field", () => {
    expect(parseChapters({})).toEqual([]);
    expect(parseChapters({ version: "1.2.0" })).toEqual([]);
  });

  it("returns empty array when chapters is not an array", () => {
    expect(parseChapters({ chapters: "not an array" })).toEqual([]);
    expect(parseChapters({ chapters: 42 })).toEqual([]);
    expect(parseChapters({ chapters: null })).toEqual([]);
  });

  it("returns empty array for empty chapters array", () => {
    expect(parseChapters({ chapters: [] })).toEqual([]);
  });

  it("preserves optional img and url fields", () => {
    const input = {
      chapters: [
        {
          startTime: 0,
          title: "With extras",
          img: "https://example.com/img.jpg",
          url: "https://example.com",
        },
        {
          startTime: 60,
          title: "No extras",
        },
      ],
    };

    const result = parseChapters(input);

    expect(result).toEqual([
      {
        startTime: 0,
        title: "With extras",
        img: "https://example.com/img.jpg",
        url: "https://example.com",
      },
      { startTime: 60, title: "No extras" },
    ]);
  });

  it("ignores empty img and url strings", () => {
    const input = {
      chapters: [
        { startTime: 0, title: "Test", img: "", url: "  " },
      ],
    };

    const result = parseChapters(input);

    expect(result).toEqual([{ startTime: 0, title: "Test" }]);
  });

  it("strips img and url with non-http(s) protocols", () => {
    const input = {
      chapters: [
        {
          startTime: 0,
          title: "XSS attempt",
          img: "javascript:alert(1)",
          url: "data:text/html,<script>alert(1)</script>",
        },
        {
          startTime: 60,
          title: "Safe",
          img: "https://example.com/img.jpg",
          url: "http://example.com",
        },
      ],
    };

    const result = parseChapters(input);

    expect(result[0]).toEqual({ startTime: 0, title: "XSS attempt" });
    expect(result[1]).toEqual({
      startTime: 60,
      title: "Safe",
      img: "https://example.com/img.jpg",
      url: "http://example.com",
    });
  });

  it("skips non-object entries in chapters array", () => {
    const input = {
      chapters: [
        null,
        42,
        "string",
        { startTime: 10, title: "Valid" },
        true,
      ],
    };

    const result = parseChapters(input);

    expect(result).toEqual([{ startTime: 10, title: "Valid" }]);
  });

  it("handles a realistic full chapters payload", () => {
    const input = {
      version: "1.2.0",
      chapters: [
        {
          startTime: 0,
          title: "Cold Open",
          img: "https://cdn.example.com/ep42/cold-open.jpg",
        },
        {
          startTime: 45.5,
          title: "Intro & Sponsors",
          url: "https://sponsor.example.com",
        },
        { startTime: 120, title: "Interview: Part 1" },
        { startTime: 600, title: "", img: "https://cdn.example.com/ad.jpg", toc: false },
        { startTime: 630, title: "Interview: Part 2" },
        { startTime: 1800, title: "Listener Questions" },
        { startTime: 2400, title: "Outro" },
      ],
    };

    const result = parseChapters(input);

    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({
      startTime: 0,
      title: "Cold Open",
      img: "https://cdn.example.com/ep42/cold-open.jpg",
    });
    expect(result[1]).toEqual({
      startTime: 45.5,
      title: "Intro & Sponsors",
      url: "https://sponsor.example.com",
    });
    expect(result[5]).toEqual({ startTime: 2400, title: "Outro" });
  });
});
