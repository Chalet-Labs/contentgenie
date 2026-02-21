import { describe, it, expect } from "vitest";
import { getAiProvider } from "../provider-factory";
import { OpenRouterProvider } from "../providers/openrouter";
import { ZaiProvider } from "../providers/zai";

describe("getAiProvider", () => {
  it("returns OpenRouterProvider for 'openrouter'", () => {
    const provider = getAiProvider("openrouter");
    expect(provider).toBeInstanceOf(OpenRouterProvider);
    expect(provider.name).toBe("openrouter");
  });

  it("returns ZaiProvider for 'zai'", () => {
    const provider = getAiProvider("zai");
    expect(provider).toBeInstanceOf(ZaiProvider);
    expect(provider.name).toBe("zai");
  });

  it("throws on unknown provider name", () => {
    expect(() =>
      getAiProvider("unknown" as never)
    ).toThrow("Unknown AI provider: unknown");
  });
});
