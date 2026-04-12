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
    expect(SYSTEM_PROMPT).toContain("signal");
  });

  it("mentions signal-based evaluation", () => {
    expect(SYSTEM_PROMPT).toContain("signal");
    expect(SYSTEM_PROMPT).toContain("inflation");
  });
});

describe("getSummarizationPrompt", () => {
  it("includes podcast and episode titles", () => {
    const prompt = getSummarizationPrompt(
      "My Podcast",
      "Episode 1",
      "A great episode",
      3600,
      "Transcript content here"
    );
    expect(prompt).toContain("My Podcast");
    expect(prompt).toContain("Episode 1");
  });

  it("computes duration in minutes", () => {
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "Description",
      5400, // 90 minutes
      "Transcript content here"
    );
    expect(prompt).toContain("90 minutes");
  });

  it("includes transcript content in prompt", () => {
    const transcript = "A".repeat(200);
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "Description",
      3600,
      transcript
    );
    expect(prompt).toContain("Transcript");
    expect(prompt).toContain(transcript);
    expect(prompt).not.toContain("Full transcript not available");
  });

  it("includes JSON format instructions", () => {
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "Description",
      3600,
      "Transcript content here"
    );
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"keyTakeaways"');
    expect(prompt).toContain('"worthItReason"');
  });

  it("includes worthItSignals in the prompt", () => {
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "Description",
      3600,
      "Transcript content here"
    );
    expect(prompt).toContain('"worthItSignals"');
    expect(prompt).toContain('"hasActionableInsights"');
    expect(prompt).toContain('"staysFocused"');
    expect(prompt).toContain('"worthItAdjustment"');
  });

  it("includes structured summary sections", () => {
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "Description",
      3600,
      "Transcript content here"
    );
    expect(prompt).toContain("TL;DR");
    expect(prompt).toContain("What You'll Learn");
    expect(prompt).toContain("Notable Quotes");
    expect(prompt).toContain("Action Items");
    expect(prompt).toContain("Bottom Line");
  });

  it("includes signal-based scoring instructions", () => {
    const prompt = getSummarizationPrompt(
      "Podcast",
      "Episode",
      "Description",
      3600,
      "Transcript content here"
    );
    expect(prompt).toContain("Boolean Quality Signals");
    expect(prompt).toContain("Adjustment (-1, 0, or +1)");
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
