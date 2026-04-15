import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    query: {
      aiConfig: {
        findFirst: vi.fn(),
      },
    },
  },
}));

import { db } from "@/db";
import { getActiveAiConfig, DEFAULT_AI_CONFIG } from "@/lib/ai/config";

describe("getActiveAiConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns DB config when a row exists", async () => {
    vi.mocked(db.query.aiConfig.findFirst).mockResolvedValue({
      id: 1,
      provider: "zai",
      model: "glm-4.7-flash",
      summarizationPrompt: null,
      updatedBy: "user_123",
      updatedAt: new Date(),
    });

    const config = await getActiveAiConfig();
    expect(config).toEqual({ provider: "zai", model: "glm-4.7-flash", summarizationPrompt: null });
  });

  it("returns DEFAULT_AI_CONFIG when no rows exist", async () => {
    vi.mocked(db.query.aiConfig.findFirst).mockResolvedValue(undefined);

    const config = await getActiveAiConfig();
    expect(config).toEqual(DEFAULT_AI_CONFIG);
  });

  it("returns DEFAULT_AI_CONFIG on DB error", async () => {
    vi.mocked(db.query.aiConfig.findFirst).mockRejectedValue(
      new Error("Connection refused")
    );

    const config = await getActiveAiConfig();
    expect(config).toEqual(DEFAULT_AI_CONFIG);
  });

  // Regression tests for issue #269: DB errors should be distinguishable from
  // "no custom config" and must not be silently swallowed via console.error.

  it("does not use console.error on DB failure — uses structured logging", async () => {
    const consoleSpy = vi.spyOn(console, "error");
    vi.mocked(db.query.aiConfig.findFirst).mockRejectedValue(
      new Error("Connection refused")
    );

    await getActiveAiConfig();

    // console.error is a sign of unstructured, unsearchable error swallowing.
    // Structured logging (e.g., a logger.error call) must be used instead.
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("throws on DB error when throwOnDbError option is set", async () => {
    const dbError = new Error("Connection refused");
    vi.mocked(db.query.aiConfig.findFirst).mockRejectedValue(dbError);

    await expect(getActiveAiConfig({ throwOnDbError: true })).rejects.toThrow(
      "Connection refused"
    );
  });

  it("DEFAULT_AI_CONFIG has expected values", () => {
    expect(DEFAULT_AI_CONFIG).toEqual({
      provider: "openrouter",
      model: "google/gemini-2.0-flash-001",
      summarizationPrompt: null,
    });
  });
});
