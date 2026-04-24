import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeClerkAuthMock } from "@/test/mocks/clerk-server";

// Mock Clerk auth
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => makeClerkAuthMock(() => mockAuth()));

// Mock the database
vi.mock("@/db", () => ({
  db: {
    query: {
      aiConfig: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock the AI config module
vi.mock("@/lib/ai", () => ({
  DEFAULT_AI_CONFIG: {
    provider: "openrouter",
    model: "google/gemini-2.0-flash-001",
  },
}));

import { db } from "@/db";
import {
  getAiConfig,
  updateAiConfig,
  updateSummarizationPrompt,
} from "@/app/actions/ai-config";

describe("getAiConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns config from database when row exists", async () => {
    vi.mocked(db.query.aiConfig.findFirst).mockResolvedValue({
      id: 1,
      provider: "zai",
      model: "glm-4.7-flash",
      summarizationPrompt: null,
      updatedBy: "user_123",
      updatedAt: new Date(),
    });

    const result = await getAiConfig();
    expect(result.config).toEqual({
      provider: "zai",
      model: "glm-4.7-flash",
      summarizationPrompt: null,
    });
    expect(result.error).toBeUndefined();
  });

  it("returns default config when no row exists", async () => {
    vi.mocked(db.query.aiConfig.findFirst).mockResolvedValue(undefined);

    const result = await getAiConfig();
    expect(result.config).toEqual({
      provider: "openrouter",
      model: "google/gemini-2.0-flash-001",
    });
  });

  it("returns default config with error on DB failure", async () => {
    vi.mocked(db.query.aiConfig.findFirst).mockRejectedValue(
      new Error("DB error"),
    );

    const result = await getAiConfig();
    expect(result.config).toEqual({
      provider: "openrouter",
      model: "google/gemini-2.0-flash-001",
    });
    expect(result.error).toBe("Failed to read AI config");
  });
});

describe("updateAiConfig", () => {
  const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi
    .fn()
    .mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      userId: "user_admin",
      has: () => true,
    });
    vi.mocked(db.insert as any).mockReturnValue({ values: mockValues });
  });

  it("allows admin to upsert config", async () => {
    const result = await updateAiConfig("zai", "glm-4.7-flash");
    expect(result).toEqual({ success: true });
    expect(db.insert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        provider: "zai",
        model: "glm-4.7-flash",
      }),
    );
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
  });

  it("rejects non-admin users", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_regular",
      has: () => false,
    });

    const result = await updateAiConfig("zai", "glm-4.7-flash");
    expect(result).toEqual({ success: false, error: "Admin access required" });
  });

  it("rejects unauthenticated users", async () => {
    mockAuth.mockResolvedValue({
      userId: null,
      has: () => false,
    });

    const result = await updateAiConfig("zai", "glm-4.7-flash");
    expect(result).toEqual({
      success: false,
      error: "You must be signed in",
    });
  });

  it("rejects invalid provider", async () => {
    const result = await updateAiConfig("invalid" as any, "some-model");
    expect(result).toEqual({ success: false, error: "Invalid provider" });
  });

  it("rejects empty model string", async () => {
    const result = await updateAiConfig("openrouter", "");
    expect(result).toEqual({
      success: false,
      error: "Model name is required",
    });
  });

  it("rejects whitespace-only model string", async () => {
    const result = await updateAiConfig("openrouter", "   ");
    expect(result).toEqual({
      success: false,
      error: "Model name is required",
    });
  });

  it("trims model string before saving", async () => {
    await updateAiConfig("openrouter", "  google/gemini-2.0-flash-001  ");

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "google/gemini-2.0-flash-001",
      }),
    );
  });
});

describe("updateSummarizationPrompt", () => {
  const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi
    .fn()
    .mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      userId: "user_admin",
      has: () => true,
    });
    vi.mocked(db.insert as any).mockReturnValue({ values: mockValues });
  });

  it("rejects unauthenticated users", async () => {
    mockAuth.mockResolvedValue({ userId: null, has: () => false });
    const result = await updateSummarizationPrompt("Analyze {{transcript}}");
    expect(result).toEqual({ success: false, error: "You must be signed in" });
  });

  it("rejects non-admin users", async () => {
    mockAuth.mockResolvedValue({ userId: "user_regular", has: () => false });
    const result = await updateSummarizationPrompt("Analyze {{transcript}}");
    expect(result).toEqual({ success: false, error: "Admin access required" });
  });

  it("rejects prompt without {{transcript}}", async () => {
    const result = await updateSummarizationPrompt(
      "Analyze this episode please",
    );
    expect(result).toEqual({
      success: false,
      error: "Prompt must contain {{transcript}}",
    });
  });

  it("rejects prompt exceeding 10,000 characters", async () => {
    const longPrompt = "{{transcript}}" + "a".repeat(9987);
    expect(longPrompt.length).toBeGreaterThan(10000);
    const result = await updateSummarizationPrompt(longPrompt);
    expect(result).toEqual({
      success: false,
      error: "Prompt must be 10,000 characters or fewer",
    });
  });

  it("rejects empty string prompt", async () => {
    const result = await updateSummarizationPrompt("");
    expect(result).toEqual({ success: false, error: "Prompt cannot be empty" });
  });

  it("persists a valid prompt", async () => {
    const prompt = "Summarize {{transcript}} for {{title}}";
    const result = await updateSummarizationPrompt(prompt);
    expect(result).toEqual({ success: true });
    expect(db.insert).toHaveBeenCalled();
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
  });

  it("accepts null to reset to default", async () => {
    const result = await updateSummarizationPrompt(null);
    expect(result).toEqual({ success: true });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ summarizationPrompt: null }),
    );
  });
});
