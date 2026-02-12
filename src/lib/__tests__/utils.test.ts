import { describe, it, expect } from "vitest";
import { cn, stripHtml } from "@/lib/utils";

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
