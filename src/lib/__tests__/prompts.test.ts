import { describe, it, expect } from "vitest";
import {
  SYSTEM_PROMPT,
  getSummarizationPrompt,
  getQuickSummaryPrompt,
} from "@/lib/prompts";

describe("SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(SYSTEM_PROMPT).toBeTruthy();
    expect(typeof SYSTEM_PROMPT).toBe("string");
  });

  it("contains key instructions", () => {
    expect(SYSTEM_PROMPT).toContain("critical");
    expect(SYSTEM_PROMPT).toContain("JSON format");
    expect(SYSTEM_PROMPT).toContain("worth it");
  });

  it("contains anti-inflation anchoring", () => {
    expect(SYSTEM_PROMPT).toContain("5");
    expect(SYSTEM_PROMPT).toContain("score inflation");
  });
});

describe("getSummarizationPrompt", () => {
  it("includes podcast and episode titles", () => {
    const prompt = getSummarizationPrompt(
      "My Podcast",
      "Episode 1",
      "A great episode",
      3600
    );
    expect(prompt).toContain("My Podcast");
    expect(prompt).toContain("Episode 1");
  });

  it("computes duration in minutes", () => {
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "Description",
      5400 // 90 minutes
    );
    expect(prompt).toContain("90 minutes");
  });

  it("uses transcript when longer than 100 characters", () => {
    const longTranscript = "A".repeat(200);
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "Description",
      3600,
      longTranscript
    );
    expect(prompt).toContain("Transcript");
    expect(prompt).toContain(longTranscript);
    expect(prompt).not.toContain(
      "Full transcript not available"
    );
  });

  it("falls back to description when transcript is short", () => {
    const shortTranscript = "Short";
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "My Description",
      3600,
      shortTranscript
    );
    expect(prompt).toContain("Episode Description");
    expect(prompt).toContain("My Description");
    expect(prompt).toContain("Full transcript not available");
  });

  it("falls back to description when no transcript", () => {
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "My Description",
      3600
    );
    expect(prompt).toContain("Episode Description");
    expect(prompt).toContain("My Description");
  });

  it("includes JSON format instructions", () => {
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "Description",
      3600
    );
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"keyTakeaways"');
    expect(prompt).toContain('"worthItScore"');
  });

  it("includes worthItDimensions in the prompt", () => {
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "Description",
      3600
    );
    expect(prompt).toContain('"worthItDimensions"');
    expect(prompt).toContain('"uniqueness"');
    expect(prompt).toContain('"actionability"');
    expect(prompt).toContain('"timeValue"');
  });

  it("includes structured summary sections", () => {
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "Description",
      3600
    );
    expect(prompt).toContain("TL;DR");
    expect(prompt).toContain("What You'll Learn");
    expect(prompt).toContain("Notable Quotes");
    expect(prompt).toContain("Action Items");
    expect(prompt).toContain("Bottom Line");
  });

  it("includes anti-inflation scoring guide", () => {
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "Description",
      3600
    );
    expect(prompt).toContain("5: Average");
    expect(prompt).toContain("Justify every point above 5");
  });
});

describe("getQuickSummaryPrompt", () => {
  it("includes title and description", () => {
    const prompt = getQuickSummaryPrompt("My Episode", "A description");
    expect(prompt).toContain("My Episode");
    expect(prompt).toContain("A description");
  });

  it("requests JSON format", () => {
    const prompt = getQuickSummaryPrompt("Title", "Description");
    expect(prompt).toContain("JSON format");
    expect(prompt).toContain('"quickSummary"');
  });
});
