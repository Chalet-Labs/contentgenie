import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterProvider } from "../providers/openrouter";

describe("OpenRouterProvider", () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    provider = new OpenRouterProvider();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("has name 'openrouter'", () => {
    expect(provider.name).toBe("openrouter");
  });

  it("throws when API key is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(
      provider.generateCompletion(
        [{ role: "user", content: "test" }],
        { model: "test-model" }
      )
    ).rejects.toThrow("OpenRouter API key is not configured");
  });

  it("sends correct headers and body", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "response" } }],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await provider.generateCompletion(
      [{ role: "user", content: "hello" }],
      { model: "test-model", maxTokens: 100, temperature: 0.5 }
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(options.headers.Authorization).toBe("Bearer test-key");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["HTTP-Referer"]).toBe("https://example.com");
    expect(options.headers["X-Title"]).toBe("ContentGenie");

    const body = JSON.parse(options.body);
    expect(body.model).toBe("test-model");
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(body.max_tokens).toBe(100);
    expect(body.temperature).toBe(0.5);
  });

  it("returns content from successful response", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "hello world" } }],
          }),
      })
    );

    const result = await provider.generateCompletion(
      [{ role: "user", content: "test" }],
      { model: "test-model" }
    );
    expect(result).toBe("hello world");
  });

  it("throws on non-ok response", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limited"),
      })
    );

    await expect(
      provider.generateCompletion(
        [{ role: "user", content: "test" }],
        { model: "test-model" }
      )
    ).rejects.toThrow("OpenRouter API error: 429 - Rate limited");
  });

  it("throws when no choices returned", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      })
    );

    await expect(
      provider.generateCompletion(
        [{ role: "user", content: "test" }],
        { model: "test-model" }
      )
    ).rejects.toThrow("No response from OpenRouter");
  });

  it("uses default params when not specified", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "ok" } }],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await provider.generateCompletion(
      [{ role: "user", content: "test" }],
      { model: "test-model" }
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(4096);
    expect(body.temperature).toBe(0.7);
  });
});
