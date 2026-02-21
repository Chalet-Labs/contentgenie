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
import { getActiveAiConfig, DEFAULT_AI_CONFIG } from "../config";

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
      updatedBy: "user_123",
      updatedAt: new Date(),
    });

    const config = await getActiveAiConfig();
    expect(config).toEqual({ provider: "zai", model: "glm-4.7-flash" });
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

  it("DEFAULT_AI_CONFIG has expected values", () => {
    expect(DEFAULT_AI_CONFIG).toEqual({
      provider: "openrouter",
      model: "google/gemini-2.0-flash-001",
    });
  });
});
