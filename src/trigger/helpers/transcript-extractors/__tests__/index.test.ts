import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTriggerSdkMock } from "@/test/mocks/trigger-sdk";

vi.mock("@trigger.dev/sdk", () => createTriggerSdkMock());

import { logger } from "@trigger.dev/sdk";
import {
  register,
  runPodcastExtractor,
  __resetRegistry,
} from "@/trigger/helpers/transcript-extractors";
import type {
  Extractor,
  ExtractorContext,
} from "@/trigger/helpers/transcript-extractors/types";

const makeCtx = (podcastIndexId: string = "pod1"): ExtractorContext => ({
  episode: {
    podcastIndexId: "ep1",
    title: "Ep",
    link: "https://example.com/ep",
    rssGuid: null,
  },
  podcast: { podcastIndexId, title: "Pod" },
});

beforeEach(() => {
  __resetRegistry();
  vi.clearAllMocks();
});

describe("runPodcastExtractor", () => {
  it("returns undefined and does not warn when no extractor is registered", async () => {
    const result = await runPodcastExtractor(makeCtx());
    expect(result).toBeUndefined();
    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled();
  });

  it("returns { transcript, extractorId } when a registered extractor returns a non-empty string", async () => {
    const extractor: Extractor = {
      id: "test-extractor",
      extract: vi.fn().mockResolvedValue("transcript-text"),
    };
    register("pod1", extractor);
    const result = await runPodcastExtractor(makeCtx());
    expect(result).toEqual({
      transcript: "transcript-text",
      extractorId: "test-extractor",
    });
  });

  it("logs at warn level and returns undefined when extractor throws", async () => {
    const extractor: Extractor = {
      id: "throws-extractor",
      extract: vi.fn().mockRejectedValue(new Error("boom")),
    };
    register("pod1", extractor);
    const result = await runPodcastExtractor(makeCtx());
    expect(result).toBeUndefined();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      "[transcript-extractors] extractor threw",
      expect.objectContaining({
        extractorId: "throws-extractor",
        podcastIndexId: "pod1",
        error: expect.any(Error),
      }),
    );
  });

  it("logs warn with raw value and returns undefined when extractor throws a non-Error value", async () => {
    const extractor: Extractor = {
      id: "throws-string-extractor",
      extract: vi.fn().mockRejectedValue("boom"),
    };
    register("pod1", extractor);
    const result = await runPodcastExtractor(makeCtx());
    expect(result).toBeUndefined();
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      "[transcript-extractors] extractor threw",
      expect.objectContaining({
        extractorId: "throws-string-extractor",
        podcastIndexId: "pod1",
        error: "boom",
      }),
    );
  });

  it("returns undefined when extractor resolves to undefined", async () => {
    const extractor: Extractor = {
      id: "undefined-extractor",
      extract: vi.fn().mockResolvedValue(undefined),
    };
    register("pod1", extractor);
    const result = await runPodcastExtractor(makeCtx());
    expect(result).toBeUndefined();
  });

  it("returns undefined when extractor resolves to empty string", async () => {
    const extractor: Extractor = {
      id: "empty-extractor",
      extract: vi.fn().mockResolvedValue(""),
    };
    register("pod1", extractor);
    const result = await runPodcastExtractor(makeCtx());
    expect(result).toBeUndefined();
  });

  it("clears registry between tests via __resetRegistry", async () => {
    const extractor: Extractor = {
      id: "cleared-extractor",
      extract: vi.fn().mockResolvedValue("text"),
    };
    register("pod1", extractor);
    // Simulate what beforeEach does — if registry was cleared, this is a miss
    __resetRegistry();
    const result = await runPodcastExtractor(makeCtx());
    expect(result).toBeUndefined();
  });

  it("keys off ctx.podcast.podcastIndexId — misses on wrong key, hits on correct key", async () => {
    const extractor: Extractor = {
      id: "keyed-extractor",
      extract: vi.fn().mockResolvedValue("keyed-text"),
    };
    register("podA", extractor);
    expect(await runPodcastExtractor(makeCtx("podB"))).toBeUndefined();
    expect(await runPodcastExtractor(makeCtx("podA"))).toEqual({
      transcript: "keyed-text",
      extractorId: "keyed-extractor",
    });
  });
});
