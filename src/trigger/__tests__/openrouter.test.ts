import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openrouter", () => ({
  generateCompletion: vi.fn(),
  parseJsonResponse: vi.fn(),
}));

vi.mock("@/lib/prompts", () => ({
  SYSTEM_PROMPT: "Mock System Prompt",
  getSummarizationPrompt: vi.fn().mockReturnValue("Mock Summarization Prompt"),
}));

import { generateEpisodeSummary } from "../helpers/openrouter";
import { generateCompletion, parseJsonResponse } from "@/lib/openrouter";
import { SYSTEM_PROMPT, getSummarizationPrompt } from "@/lib/prompts";
import type { PodcastIndexPodcast, PodcastIndexEpisode } from "@/lib/podcastindex";

describe("generateEpisodeSummary", () => {
  const mockPodcast = {
    id: 1,
    title: "Test Podcast",
    url: "https://example.com/rss",
    image: "https://example.com/image.jpg",
  } as unknown as PodcastIndexPodcast;

  const mockEpisode = {
    id: 101,
    title: "Test Episode",
    description: "Test Description",
    duration: 3600,
    enclosureUrl: "https://example.com/audio.mp3",
  } as unknown as PodcastIndexEpisode;

  const mockTranscript = "Test transcript content";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully generates and parses a summary", async () => {
    const mockRawResponse = '{"summary":"Parsed summary","keyTakeaways":["T1"],"worthItScore":9,"worthItReason":"Great"}';
    const mockParsedResult = {
      summary: "Parsed summary",
      keyTakeaways: ["T1"],
      worthItScore: 9,
      worthItReason: "Great",
    };

    vi.mocked(generateCompletion).mockResolvedValue(mockRawResponse);
    vi.mocked(parseJsonResponse).mockReturnValue(mockParsedResult);

    const result = await generateEpisodeSummary(mockPodcast, mockEpisode, mockTranscript);

    expect(result).toEqual(mockParsedResult);
    expect(getSummarizationPrompt).toHaveBeenCalledWith(
      "Test Podcast",
      "Test Episode",
      "Test Description",
      3600,
      mockTranscript
    );
    expect(generateCompletion).toHaveBeenCalledWith([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "Mock Summarization Prompt" },
    ]);
    expect(parseJsonResponse).toHaveBeenCalledWith(mockRawResponse);
  });

  it("returns fallback object when parsing fails", async () => {
    const malformedResponse = "LLM returned some garbage instead of JSON";

    vi.mocked(generateCompletion).mockResolvedValue(malformedResponse);
    vi.mocked(parseJsonResponse).mockImplementation(() => {
      throw new Error("JSON parse error");
    });

    const result = await generateEpisodeSummary(mockPodcast, mockEpisode, mockTranscript);

    expect(result).toEqual({
      summary: malformedResponse,
      keyTakeaways: [],
      worthItScore: 5,
      worthItReason: "Unable to parse structured response",
    });
    expect(parseJsonResponse).toHaveBeenCalledWith(malformedResponse);
  });

  it("handles undefined podcast and missing episode fields", async () => {
    const minimalEpisode = {
      id: 102,
      title: "Minimal Episode",
    } as unknown as PodcastIndexEpisode;

    const mockRawResponse = '{"summary":"Min summary","keyTakeaways":[],"worthItScore":5,"worthItReason":"OK"}';
    vi.mocked(generateCompletion).mockResolvedValue(mockRawResponse);
    vi.mocked(parseJsonResponse).mockReturnValue({
      summary: "Min summary",
      keyTakeaways: [],
      worthItScore: 5,
      worthItReason: "OK",
    });

    await generateEpisodeSummary(undefined, minimalEpisode, undefined);

    expect(getSummarizationPrompt).toHaveBeenCalledWith(
      "Unknown Podcast",
      "Minimal Episode",
      "",
      0,
      undefined
    );
  });
});
