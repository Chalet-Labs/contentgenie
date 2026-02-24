import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Trigger.dev SDK before imports
const mockMetadataSet = vi.fn();
vi.mock("@trigger.dev/sdk", () => ({
  task: vi.fn((config) => config),
  metadata: {
    set: (...args: unknown[]) => mockMetadataSet(...args),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockBatchTriggerAndWait = vi.fn();

vi.mock("@/trigger/summarize-episode", () => ({
  summarizeEpisode: {
    batchTriggerAndWait: (...args: unknown[]) =>
      mockBatchTriggerAndWait(...args),
  },
}));

const mockDbSelect = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: {
    podcastIndexId: "podcast_index_id",
    processedAt: "processed_at",
    podcastId: "podcast_id",
    publishDate: "publish_date",
    worthItScore: "worth_it_score",
  },
  podcasts: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ type: "and", conditions: args })),
  isNotNull: vi.fn((col: unknown) => ({ type: "isNotNull", col })),
  lte: vi.fn((col: unknown, val: unknown) => ({ type: "lte", col, val })),
  gte: vi.fn((col: unknown, val: unknown) => ({ type: "gte", col, val })),
  eq: vi.fn((col: unknown, val: unknown) => ({ type: "eq", col, val })),
  sql: vi.fn(),
}));

import { bulkResummarize } from "@/trigger/bulk-resummarize";
import type { BulkResummarizePayload } from "@/trigger/bulk-resummarize";
import { metadata } from "@trigger.dev/sdk";

// The task mock returns the raw config object, so `.run` is available at runtime
const taskConfig = bulkResummarize as unknown as {
  run: (payload: BulkResummarizePayload) => Promise<{
    total: number;
    succeeded: number;
    failed: number;
    failures: Array<{ episodeId: number; error: string }>;
  }>;
};

// Helper to set up db.select chain for returning a list of episodes
function mockDbSelectResult(episodes: Array<{ podcastIndexId: string }>) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(episodes),
    }),
  });
}

describe("bulk-resummarize task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchTriggerAndWait.mockResolvedValue({ runs: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns early with empty result when no matching episodes", async () => {
    mockDbSelectResult([]);

    const result = await taskConfig.run({});

    expect(result).toEqual({ total: 0, succeeded: 0, failed: 0, failures: [] });
    expect(mockBatchTriggerAndWait).not.toHaveBeenCalled();
    expect(mockMetadataSet).toHaveBeenCalledWith("progress", {
      total: 0,
      completed: 0,
      failed: 0,
      currentChunk: 0,
      totalChunks: 1,
    });
  });

  it("processes a single episode successfully", async () => {
    mockDbSelectResult([{ podcastIndexId: "42" }]);
    mockBatchTriggerAndWait.mockResolvedValue({
      runs: [{ ok: true, output: { summary: "test" } }],
    });

    const result = await taskConfig.run({});

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.failures).toEqual([]);
    expect(mockBatchTriggerAndWait).toHaveBeenCalledOnce();
    expect(mockBatchTriggerAndWait).toHaveBeenCalledWith([
      { payload: { episodeId: 42 } },
    ]);
  });

  it("does NOT pass idempotencyKey in batch items (v3.3.0 bug mitigation)", async () => {
    mockDbSelectResult([{ podcastIndexId: "10" }, { podcastIndexId: "20" }]);
    mockBatchTriggerAndWait.mockResolvedValue({
      runs: [
        { ok: true, output: {} },
        { ok: true, output: {} },
      ],
    });

    await taskConfig.run({});

    const callArgs = mockBatchTriggerAndWait.mock.calls[0][0] as Array<{
      payload: unknown;
      options?: unknown;
    }>;
    for (const item of callArgs) {
      expect(item).not.toHaveProperty("options.idempotencyKey");
    }
  });

  it("handles exactly 500 episodes in a single chunk", async () => {
    const episodes500 = Array.from({ length: 500 }, (_, i) => ({
      podcastIndexId: String(i + 1),
    }));
    mockDbSelectResult(episodes500);
    mockBatchTriggerAndWait.mockResolvedValue({
      runs: Array.from({ length: 500 }, () => ({ ok: true, output: {} })),
    });

    const result = await taskConfig.run({});

    expect(result.total).toBe(500);
    expect(result.succeeded).toBe(500);
    expect(mockBatchTriggerAndWait).toHaveBeenCalledOnce();
  });

  it("chunks 501 episodes into two batchTriggerAndWait calls", async () => {
    const episodes501 = Array.from({ length: 501 }, (_, i) => ({
      podcastIndexId: String(i + 1),
    }));
    mockDbSelectResult(episodes501);
    mockBatchTriggerAndWait
      .mockResolvedValueOnce({
        runs: Array.from({ length: 500 }, () => ({ ok: true, output: {} })),
      })
      .mockResolvedValueOnce({
        runs: [{ ok: true, output: {} }],
      });

    const result = await taskConfig.run({});

    expect(result.total).toBe(501);
    expect(result.succeeded).toBe(501);
    expect(mockBatchTriggerAndWait).toHaveBeenCalledTimes(2);
    // First chunk: 500 items
    expect(mockBatchTriggerAndWait.mock.calls[0][0]).toHaveLength(500);
    // Second chunk: 1 item
    expect(mockBatchTriggerAndWait.mock.calls[1][0]).toHaveLength(1);
  });

  it("accumulates failures from child tasks across multiple chunks", async () => {
    const episodes600 = Array.from({ length: 600 }, (_, i) => ({
      podcastIndexId: String(i + 1),
    }));
    mockDbSelectResult(episodes600);

    // Chunk 1: 500 items, 2 fail
    const chunk1Runs = Array.from({ length: 500 }, (_, i) => ({
      ok: i !== 10 && i !== 200,
      output: i !== 10 && i !== 200 ? {} : undefined,
      error: i === 10 ? new Error("Episode 11 failed") : i === 200 ? "Episode 201 failed" : undefined,
    }));
    // Chunk 2: 100 items, 1 fail
    const chunk2Runs = Array.from({ length: 100 }, (_, i) => ({
      ok: i !== 5,
      output: i !== 5 ? {} : undefined,
      error: i === 5 ? new Error("Episode 506 failed") : undefined,
    }));

    mockBatchTriggerAndWait
      .mockResolvedValueOnce({ runs: chunk1Runs })
      .mockResolvedValueOnce({ runs: chunk2Runs });

    const result = await taskConfig.run({});

    expect(result.total).toBe(600);
    expect(result.succeeded).toBe(597);
    expect(result.failed).toBe(3);
    expect(result.failures).toHaveLength(3);
  });

  it("initializes metadata with correct total and totalChunks for single chunk", async () => {
    mockDbSelectResult([
      { podcastIndexId: "1" },
      { podcastIndexId: "2" },
      { podcastIndexId: "3" },
    ]);
    mockBatchTriggerAndWait.mockResolvedValue({
      runs: Array.from({ length: 3 }, () => ({ ok: true, output: {} })),
    });

    await taskConfig.run({});

    expect(mockMetadataSet).toHaveBeenCalledWith("progress", {
      total: 3,
      completed: 0,
      failed: 0,
      currentChunk: 0,
      totalChunks: 1,
    });
  });

  it("updates metadata.progress currentChunk after each chunk", async () => {
    const episodes501 = Array.from({ length: 501 }, (_, i) => ({
      podcastIndexId: String(i + 1),
    }));
    mockDbSelectResult(episodes501);
    mockBatchTriggerAndWait
      .mockResolvedValueOnce({
        runs: Array.from({ length: 500 }, () => ({ ok: true, output: {} })),
      })
      .mockResolvedValueOnce({
        runs: [{ ok: true, output: {} }],
      });

    await taskConfig.run({});

    // Initial metadata set
    expect(mockMetadataSet).toHaveBeenCalledWith("progress", expect.objectContaining({
      currentChunk: 0,
      totalChunks: 2,
    }));
    // After chunk 1
    expect(mockMetadataSet).toHaveBeenCalledWith("progress", expect.objectContaining({
      currentChunk: 1,
      totalChunks: 2,
    }));
    // After chunk 2 (final)
    expect(mockMetadataSet).toHaveBeenCalledWith("progress", expect.objectContaining({
      currentChunk: 2,
      totalChunks: 2,
    }));
  });

  it("handles non-Error failure values from child tasks", async () => {
    mockDbSelectResult([
      { podcastIndexId: "1" },
      { podcastIndexId: "2" },
      { podcastIndexId: "3" },
    ]);
    mockBatchTriggerAndWait.mockResolvedValue({
      runs: [
        { ok: false, error: new Error("Explicit error") },
        { ok: false, error: "String error" },
        { ok: false, error: undefined },
      ],
    });

    const result = await taskConfig.run({});

    expect(result.failures).toContainEqual({ episodeId: 1, error: "Explicit error" });
    expect(result.failures).toContainEqual({ episodeId: 2, error: "String error" });
    expect(result.failures).toContainEqual({ episodeId: 3, error: "Unknown error" });
  });

  it("casts podcastIndexId string to number for child payloads", async () => {
    mockDbSelectResult([{ podcastIndexId: "12345" }]);
    mockBatchTriggerAndWait.mockResolvedValue({
      runs: [{ ok: true, output: {} }],
    });

    await taskConfig.run({});

    expect(mockBatchTriggerAndWait).toHaveBeenCalledWith([
      { payload: { episodeId: 12345 } },
    ]);
    // Ensure it's a number, not a string
    const callArgs = mockBatchTriggerAndWait.mock.calls[0][0] as Array<{
      payload: { episodeId: unknown };
    }>;
    expect(typeof callArgs[0].payload.episodeId).toBe("number");
  });

  it("returns correct final result when all child tasks fail", async () => {
    mockDbSelectResult([
      { podcastIndexId: "1" },
      { podcastIndexId: "2" },
    ]);
    mockBatchTriggerAndWait.mockResolvedValue({
      runs: [
        { ok: false, error: new Error("Failed 1") },
        { ok: false, error: new Error("Failed 2") },
      ],
    });

    const result = await taskConfig.run({});

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.failures).toHaveLength(2);
  });

  it("task config has correct queue (concurrencyLimit 1) and maxDuration (3600)", () => {
    const config = bulkResummarize as unknown as {
      queue: { name: string; concurrencyLimit: number };
      maxDuration: number;
      retry: { maxAttempts: number };
    };
    expect(config.queue.name).toBe("bulk-resummarize-queue");
    expect(config.queue.concurrencyLimit).toBe(1);
    expect(config.maxDuration).toBe(3600);
    expect(config.retry.maxAttempts).toBe(1);
  });
});
