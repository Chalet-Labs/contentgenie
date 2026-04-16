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

  // Regression: #269
  describe("DB error handling", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(db.query.aiConfig.findFirst).mockRejectedValue(
        new Error("Connection refused")
      );
    });

    it("returns DEFAULT_AI_CONFIG on DB error", async () => {
      const config = await getActiveAiConfig();
      expect(config).toEqual(DEFAULT_AI_CONFIG);
    });

    it("emits structured console.error with context on DB failure", async () => {
      await getActiveAiConfig();

      expect(errorSpy).toHaveBeenCalledOnce();
      expect(errorSpy.mock.calls[0][0]).toBe(
        "[ai-config] Failed to read AI config from database, using default"
      );
      expect(errorSpy.mock.calls[0][1]).toMatchObject({
        event: "ai_config_db_error",
        error: "Connection refused",
      });
    });

    it("throws on DB error when throwOnDbError option is set", async () => {
      await expect(getActiveAiConfig({ throwOnDbError: true })).rejects.toThrow(
        "Connection refused"
      );
    });
  });

  it("DEFAULT_AI_CONFIG has expected values", () => {
    expect(DEFAULT_AI_CONFIG).toEqual({
      provider: "openrouter",
      model: "google/gemini-2.0-flash-001",
      summarizationPrompt: null,
    });
  });
});
