import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();

// Mock Trigger.dev SDK before imports
vi.mock("@trigger.dev/sdk", () => ({
  task: vi.fn((config) => config),
  metadata: {
    set: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      episodes: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: { podcastIndexId: "podcastIndexId" },
}));

vi.mock("drizzle-orm", () => ({
  inArray: vi.fn(),
}));

const mockBatchTriggerAndWait = vi.fn();

vi.mock("@/trigger/summarize-episode", () => ({
  summarizeEpisode: {
    batchTriggerAndWait: (...args: unknown[]) =>
      mockBatchTriggerAndWait(...args),
  },
}));

import { batchSummarizeEpisodes } from "@/trigger/batch-summarize-episodes";
import { metadata } from "@trigger.dev/sdk";

describe("batch-summarize-episodes task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_default", runs: [] });
  });

  it("returns early when all episodes are already cached", async () => {
    mockFindMany.mockResolvedValue([
      { podcastIndexId: "1", processedAt: new Date() },
      { podcastIndexId: "2", processedAt: new Date() },
    ]);

    const result = await batchSummarizeEpisodes.run({
      episodeIds: [1, 2],
    });

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.results).toEqual([
      { episodeId: 1, status: "skipped" },
      { episodeId: 2, status: "skipped" },
    ]);
    expect(mockBatchTriggerAndWait).not.toHaveBeenCalled();
    expect(metadata.set).toHaveBeenCalledWith("progress", {
      total: 2,
      succeeded: 0,
      failed: 0,
      skipped: 2,
      completed: 2,
    });
  });

  it("triggers all episodes when none are cached", async () => {
    mockFindMany.mockResolvedValue([]);
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_1", runs: [
      { ok: true, output: { summary: "Summary 1" } },
      { ok: true, output: { summary: "Summary 2" } },
      { ok: true, output: { summary: "Summary 3" } },
    ] });

    const result = await batchSummarizeEpisodes.run({
      episodeIds: [10, 20, 30],
    });

    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.results).toEqual([
      { episodeId: 10, status: "succeeded" },
      { episodeId: 20, status: "succeeded" },
      { episodeId: 30, status: "succeeded" },
    ]);
    expect(mockBatchTriggerAndWait).toHaveBeenCalledWith([
      { payload: { episodeId: 10 }, options: { idempotencyKey: "batch-summarize-10" } },
      { payload: { episodeId: 20 }, options: { idempotencyKey: "batch-summarize-20" } },
      { payload: { episodeId: 30 }, options: { idempotencyKey: "batch-summarize-30" } },
    ]);
  });

  it("handles mixed cached and uncached episodes", async () => {
    mockFindMany.mockResolvedValue([
      { podcastIndexId: "1", processedAt: new Date() },
      { podcastIndexId: "3", processedAt: null },
    ]);
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_2", runs: [
      { ok: true, output: { summary: "Summary 2" } },
      { ok: true, output: { summary: "Summary 3" } },
    ] });

    const result = await batchSummarizeEpisodes.run({
      episodeIds: [1, 2, 3],
    });

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.results).toContainEqual({ episodeId: 1, status: "skipped" });
    expect(result.results).toContainEqual({ episodeId: 2, status: "succeeded" });
    expect(result.results).toContainEqual({ episodeId: 3, status: "succeeded" });

    // Only uncached episodes should be triggered
    expect(mockBatchTriggerAndWait).toHaveBeenCalledWith([
      { payload: { episodeId: 2 }, options: { idempotencyKey: "batch-summarize-2" } },
      { payload: { episodeId: 3 }, options: { idempotencyKey: "batch-summarize-3" } },
    ]);
  });

  it("handles failed child tasks", async () => {
    mockFindMany.mockResolvedValue([]);
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_3", runs: [
      { ok: true, output: { summary: "Summary 1" } },
      { ok: false, error: new Error("Episode not found") },
      { ok: true, output: { summary: "Summary 3" } },
    ] });

    const result = await batchSummarizeEpisodes.run({
      episodeIds: [10, 20, 30],
    });

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.results).toContainEqual({ episodeId: 10, status: "succeeded" });
    expect(result.results).toContainEqual({
      episodeId: 20,
      status: "failed",
      error: "Episode not found",
    });
    expect(result.results).toContainEqual({ episodeId: 30, status: "succeeded" });
  });

  it("handles all child tasks failing", async () => {
    mockFindMany.mockResolvedValue([]);
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_4", runs: [
      { ok: false, error: new Error("Error 1") },
      { ok: false, error: new Error("Error 2") },
    ] });

    const result = await batchSummarizeEpisodes.run({
      episodeIds: [10, 20],
    });

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it("handles non-Error error values from child tasks", async () => {
    mockFindMany.mockResolvedValue([]);
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_5", runs: [
      { ok: false, error: "string error" },
      { ok: false, error: undefined },
    ] });

    const result = await batchSummarizeEpisodes.run({
      episodeIds: [10, 20],
    });

    expect(result.results).toContainEqual({
      episodeId: 10,
      status: "failed",
      error: "string error",
    });
    expect(result.results).toContainEqual({
      episodeId: 20,
      status: "failed",
      error: "Unknown error",
    });
  });

  it("updates progress metadata correctly throughout execution", async () => {
    mockFindMany.mockResolvedValue([
      { podcastIndexId: "1", processedAt: new Date() },
    ]);
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_6", runs: [
      { ok: true, output: { summary: "Summary" } },
      { ok: false, error: new Error("Failed") },
    ] });

    await batchSummarizeEpisodes.run({
      episodeIds: [1, 2, 3],
    });

    // Initial progress (after filtering, before batch trigger)
    expect(metadata.set).toHaveBeenCalledWith("progress", {
      total: 3,
      succeeded: 0,
      failed: 0,
      skipped: 1,
      completed: 1,
    });

    // Final progress
    expect(metadata.set).toHaveBeenCalledWith("progress", {
      total: 3,
      succeeded: 1,
      failed: 1,
      skipped: 1,
      completed: 3,
    });
  });

  it("handles a single episode batch", async () => {
    mockFindMany.mockResolvedValue([]);
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_7", runs: [
      { ok: true, output: { summary: "Solo summary" } },
    ] });

    const result = await batchSummarizeEpisodes.run({
      episodeIds: [42],
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.results).toEqual([
      { episodeId: 42, status: "succeeded" },
    ]);
  });
});
