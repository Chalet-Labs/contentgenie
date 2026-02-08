import { describe, it, expect, vi, beforeEach } from "vitest";

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

const mockBatchTriggerAndWait = vi.fn();

vi.mock("@/trigger/summarize-episode", () => ({
  summarizeEpisode: {
    batchTriggerAndWait: (...args: unknown[]) =>
      mockBatchTriggerAndWait(...args),
  },
}));

import { batchSummarizeEpisodes } from "@/trigger/batch-summarize-episodes";
import { metadata } from "@trigger.dev/sdk";

// The task mock returns the raw config object, so `.run` is available at runtime
const taskConfig = batchSummarizeEpisodes as unknown as {
  run: (payload: { episodeIds: number[]; skippedCount: number; totalRequested: number }) => Promise<{
    succeeded: number;
    failed: number;
    skipped: number;
    results: Array<{ episodeId: number; status: string; error?: string }>;
  }>;
};

describe("batch-summarize-episodes task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_default", runs: [] });
  });

  it("returns early when episodeIds is empty (all pre-filtered by API)", async () => {
    const result = await taskConfig.run({
      episodeIds: [],
      skippedCount: 3,
      totalRequested: 3,
    });

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(3);
    expect(result.results).toEqual([]);
    expect(mockBatchTriggerAndWait).not.toHaveBeenCalled();
    expect(metadata.set).toHaveBeenCalledWith("progress", {
      total: 3,
      succeeded: 0,
      failed: 0,
      skipped: 3,
      completed: 3,
    });
  });

  it("triggers all episodes when none are skipped", async () => {
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_1", runs: [
      { ok: true, output: { summary: "Summary 1" } },
      { ok: true, output: { summary: "Summary 2" } },
      { ok: true, output: { summary: "Summary 3" } },
    ] });

    const result = await taskConfig.run({
      episodeIds: [10, 20, 30],
      skippedCount: 0,
      totalRequested: 3,
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

  it("reports skipped count from payload alongside processed results", async () => {
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_2", runs: [
      { ok: true, output: { summary: "Summary 2" } },
      { ok: true, output: { summary: "Summary 3" } },
    ] });

    const result = await taskConfig.run({
      episodeIds: [2, 3],
      skippedCount: 1,
      totalRequested: 3,
    });

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.results).toEqual([
      { episodeId: 2, status: "succeeded" },
      { episodeId: 3, status: "succeeded" },
    ]);

    // Only uncached episodes should be triggered
    expect(mockBatchTriggerAndWait).toHaveBeenCalledWith([
      { payload: { episodeId: 2 }, options: { idempotencyKey: "batch-summarize-2" } },
      { payload: { episodeId: 3 }, options: { idempotencyKey: "batch-summarize-3" } },
    ]);
  });

  it("handles failed child tasks", async () => {
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_3", runs: [
      { ok: true, output: { summary: "Summary 1" } },
      { ok: false, error: new Error("Episode not found") },
      { ok: true, output: { summary: "Summary 3" } },
    ] });

    const result = await taskConfig.run({
      episodeIds: [10, 20, 30],
      skippedCount: 0,
      totalRequested: 3,
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
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_4", runs: [
      { ok: false, error: new Error("Error 1") },
      { ok: false, error: new Error("Error 2") },
    ] });

    const result = await taskConfig.run({
      episodeIds: [10, 20],
      skippedCount: 0,
      totalRequested: 2,
    });

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it("handles non-Error error values from child tasks", async () => {
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_5", runs: [
      { ok: false, error: "string error" },
      { ok: false, error: undefined },
    ] });

    const result = await taskConfig.run({
      episodeIds: [10, 20],
      skippedCount: 0,
      totalRequested: 2,
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
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_6", runs: [
      { ok: true, output: { summary: "Summary" } },
      { ok: false, error: new Error("Failed") },
    ] });

    await taskConfig.run({
      episodeIds: [2, 3],
      skippedCount: 1,
      totalRequested: 3,
    });

    // Initial progress (before batch trigger)
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
    mockBatchTriggerAndWait.mockResolvedValue({ id: "batch_7", runs: [
      { ok: true, output: { summary: "Solo summary" } },
    ] });

    const result = await taskConfig.run({
      episodeIds: [42],
      skippedCount: 0,
      totalRequested: 1,
    });

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.results).toEqual([
      { episodeId: 42, status: "succeeded" },
    ]);
  });
});
