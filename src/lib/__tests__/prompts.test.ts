import { describe, it, expect } from "vitest";
import {
  SYSTEM_PROMPT,
  getSummarizationPrompt,
  getQuickSummaryPrompt,
  getTrendingTopicsPrompt,
  TRENDING_SUMMARY_SNIPPET_CHARS,
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

describe("getSummarizationPrompt ad-exclusion guards", () => {
  const prompt = getSummarizationPrompt(
    "Podcast",
    "Episode",
    "Description",
    3600,
    "Transcript content here"
  );

  it("instructs staysFocused to ignore ads and sponsor reads", () => {
    expect(prompt).toMatch(/ignore ads and sponsor reads/i);
    expect(prompt).toMatch(/editorial content only/i);
  });

  it("instructs timeJustified to exclude ads and sponsor reads", () => {
    expect(prompt).toMatch(/exclude ads and sponsor reads from this judgment/i);
    expect(prompt).toMatch(/users can skip them/i);
  });

  it("forbids applying -1 for ads, sponsor reads, or promotional segments", () => {
    expect(prompt).toMatch(
      /never apply -1 for ads, sponsor reads, or promotional segments/i
    );
  });

  it("forbids citing ads as negatives in the Bottom Line or worthItReason", () => {
    expect(prompt).toMatch(
      /do not cite ads, sponsor reads, or promo length as negatives/i
    );
  });

  it("does not frame ads as a quality deduction anywhere in the prompt", () => {
    // Lexical smell-test — not exhaustive. A determined edit using synonyms
    // like "diminish" or "downgrade" can slip through; the positive assertions
    // above are the primary guard.
    expect(prompt).not.toMatch(
      /\b(ads?|sponsor(ship)? reads?)\b.*\b(reduce|dilute|hurt|lower|degrade|diminish|downgrade|detract)\b/i
    );
    expect(prompt).not.toMatch(/penaliz\w* .*\b(ads?|sponsor|promo)/i);
  });
});

describe("getTrendingTopicsPrompt", () => {
  it("serializes the summary field (not keyTakeaways) in the payload", () => {
    const prompt = getTrendingTopicsPrompt([
      { id: 1, title: "AI in Healthcare", summary: "A deep dive into medical LLMs." },
    ]);
    expect(prompt).toContain('"summary": "A deep dive into medical LLMs."');
    expect(prompt).not.toContain("keyTakeaways");
  });

  it("includes every episode's id and title in the serialized payload", () => {
    const prompt = getTrendingTopicsPrompt([
      { id: 42, title: "Ep 42", summary: "s1" },
      { id: 99, title: "Ep 99", summary: "s2" },
    ]);
    expect(prompt).toContain('"id": 42');
    expect(prompt).toContain('"title": "Ep 42"');
    expect(prompt).toContain('"id": 99');
    expect(prompt).toContain('"title": "Ep 99"');
  });

  it("JSON-escapes markdown summaries with quotes, newlines, and backticks", () => {
    const summary = `## TL;DR\nUses \`fetch()\` with "retry" logic.\n\n- bullet`;
    const prompt = getTrendingTopicsPrompt([
      { id: 1, title: "Ep", summary },
    ]);
    // JSON serialization must escape the embedded quotes + preserve content
    expect(prompt).toContain('\\"retry\\"');
    expect(prompt).toContain("\\n");
    // Payload must round-trip back to the original
    const payloadMatch = prompt.match(/<episodes>\n([\s\S]*?)\n<\/episodes>/);
    expect(payloadMatch).not.toBeNull();
    const parsed = JSON.parse(payloadMatch![1]);
    expect(parsed[0].summary).toBe(summary);
  });

  it("truncates oversized summaries so the payload fits a reasoning context window", () => {
    const huge = "x".repeat(TRENDING_SUMMARY_SNIPPET_CHARS * 3);
    const prompt = getTrendingTopicsPrompt([
      { id: 1, title: "Ep", summary: huge },
    ]);
    const payloadMatch = prompt.match(/<episodes>\n([\s\S]*?)\n<\/episodes>/);
    expect(payloadMatch).not.toBeNull();
    const parsed = JSON.parse(payloadMatch![1]);
    expect(parsed[0].summary.length).toBe(TRENDING_SUMMARY_SNIPPET_CHARS);
  });

  it("reports the provided episode count in the prompt header", () => {
    const episodes = Array.from({ length: 7 }, (_, i) => ({
      id: i + 1,
      title: `Ep ${i + 1}`,
      summary: `Summary ${i + 1}`,
    }));
    const prompt = getTrendingTopicsPrompt(episodes);
    expect(prompt).toContain("Analyze these 7 recently summarized podcast episodes");
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
