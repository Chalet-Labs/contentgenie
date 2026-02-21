import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../config", () => ({
  getActiveAiConfig: vi.fn(),
  DEFAULT_AI_CONFIG: { provider: "openrouter", model: "google/gemini-2.0-flash-001" },
}));

vi.mock("../provider-factory", () => ({
  getAiProvider: vi.fn(),
}));

import { generateCompletion } from "../generate";
import { getActiveAiConfig } from "../config";
import { getAiProvider } from "../provider-factory";

describe("generateCompletion", () => {
  const mockGenerateCompletion = vi.fn();
  const mockProvider = {
    name: "openrouter" as const,
    generateCompletion: mockGenerateCompletion,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveAiConfig).mockResolvedValue({
      provider: "openrouter",
      model: "google/gemini-2.0-flash-001",
    });
    vi.mocked(getAiProvider).mockReturnValue(mockProvider);
    mockGenerateCompletion.mockResolvedValue("AI response");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads config from DB and dispatches to correct provider", async () => {
    const messages = [{ role: "user" as const, content: "hello" }];

    const result = await generateCompletion(messages);

    expect(getActiveAiConfig).toHaveBeenCalledOnce();
    expect(getAiProvider).toHaveBeenCalledWith("openrouter");
    expect(mockGenerateCompletion).toHaveBeenCalledWith(messages, {
      model: "google/gemini-2.0-flash-001",
      maxTokens: undefined,
      temperature: undefined,
    });
    expect(result).toBe("AI response");
  });

  it("uses options.model when provided, overriding config", async () => {
    const messages = [{ role: "user" as const, content: "test" }];

    await generateCompletion(messages, { model: "custom-model" });

    expect(mockGenerateCompletion).toHaveBeenCalledWith(messages, {
      model: "custom-model",
      maxTokens: undefined,
      temperature: undefined,
    });
  });

  it("passes maxTokens and temperature through", async () => {
    const messages = [{ role: "user" as const, content: "test" }];

    await generateCompletion(messages, {
      maxTokens: 2048,
      temperature: 0.3,
    });

    expect(mockGenerateCompletion).toHaveBeenCalledWith(messages, {
      model: "google/gemini-2.0-flash-001",
      maxTokens: 2048,
      temperature: 0.3,
    });
  });

  it("dispatches to zai provider when config says zai", async () => {
    const zaiProvider = {
      name: "zai" as const,
      generateCompletion: vi.fn().mockResolvedValue("ZAI response"),
    };
    vi.mocked(getActiveAiConfig).mockResolvedValue({
      provider: "zai",
      model: "glm-4.7-flash",
    });
    vi.mocked(getAiProvider).mockReturnValue(zaiProvider);

    const messages = [{ role: "user" as const, content: "test" }];
    const result = await generateCompletion(messages);

    expect(getAiProvider).toHaveBeenCalledWith("zai");
    expect(zaiProvider.generateCompletion).toHaveBeenCalledWith(messages, {
      model: "glm-4.7-flash",
      maxTokens: undefined,
      temperature: undefined,
    });
    expect(result).toBe("ZAI response");
  });
});
