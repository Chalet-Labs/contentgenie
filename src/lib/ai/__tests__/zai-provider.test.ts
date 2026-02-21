import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ZaiProvider } from "../providers/zai";

describe("ZaiProvider", () => {
  let provider: ZaiProvider;

  beforeEach(() => {
    provider = new ZaiProvider();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("has name 'zai'", () => {
    expect(provider.name).toBe("zai");
  });

  it("throws when API key is missing", async () => {
    vi.stubEnv("ZAI_API_KEY", "");
    await expect(
      provider.generateCompletion(
        [{ role: "user", content: "test" }],
        { model: "glm-4.7-flash" }
      )
    ).rejects.toThrow("Z.AI API key is not configured");
  });

  it("sends correct headers and body (no HTTP-Referer or X-Title)", async () => {
    vi.stubEnv("ZAI_API_KEY", "zai-test-key");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "response" }, finish_reason: "stop" }],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await provider.generateCompletion(
      [{ role: "user", content: "hello" }],
      { model: "glm-4.7-flash", maxTokens: 200, temperature: 0.3 }
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.z.ai/api/paas/v4/chat/completions");
    expect(options.headers.Authorization).toBe("Bearer zai-test-key");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers).not.toHaveProperty("HTTP-Referer");
    expect(options.headers).not.toHaveProperty("X-Title");

    const body = JSON.parse(options.body);
    expect(body.model).toBe("glm-4.7-flash");
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(body.max_tokens).toBe(200);
    expect(body.temperature).toBe(0.3);
  });

  it("returns content from successful response", async () => {
    vi.stubEnv("ZAI_API_KEY", "zai-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "hello world" }, finish_reason: "stop" }],
          }),
      })
    );

    const result = await provider.generateCompletion(
      [{ role: "user", content: "test" }],
      { model: "glm-4.7-flash" }
    );
    expect(result).toBe("hello world");
  });

  it("throws on non-ok response", async () => {
    vi.stubEnv("ZAI_API_KEY", "zai-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      })
    );

    await expect(
      provider.generateCompletion(
        [{ role: "user", content: "test" }],
        { model: "glm-4.7-flash" }
      )
    ).rejects.toThrow("Z.AI API error: 401 - Unauthorized");
  });

  it("throws when no choices returned", async () => {
    vi.stubEnv("ZAI_API_KEY", "zai-test-key");
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
        { model: "glm-4.7-flash" }
      )
    ).rejects.toThrow("No response from Z.AI");
  });

  it("throws on finish_reason 'sensitive'", async () => {
    vi.stubEnv("ZAI_API_KEY", "zai-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              { message: { content: "" }, finish_reason: "sensitive" },
            ],
          }),
      })
    );

    await expect(
      provider.generateCompletion(
        [{ role: "user", content: "test" }],
        { model: "glm-4.7-flash" }
      )
    ).rejects.toThrow("Z.AI content filter");
  });

  it("throws on finish_reason 'network_error'", async () => {
    vi.stubEnv("ZAI_API_KEY", "zai-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              { message: { content: "" }, finish_reason: "network_error" },
            ],
          }),
      })
    );

    await expect(
      provider.generateCompletion(
        [{ role: "user", content: "test" }],
        { model: "glm-4.7-flash" }
      )
    ).rejects.toThrow("Z.AI network error");
  });

  it("uses default params when not specified", async () => {
    vi.stubEnv("ZAI_API_KEY", "zai-test-key");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await provider.generateCompletion(
      [{ role: "user", content: "test" }],
      { model: "glm-4.7-flash" }
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(4096);
    expect(body.temperature).toBe(0.7);
  });
});
