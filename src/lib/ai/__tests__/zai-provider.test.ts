import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ZaiProvider, ZAI_DEBUG_REASONING_ENV } from "../providers/zai";

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
    expect(url).toBe("https://api.z.ai/api/coding/paas/v4/chat/completions");
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

  it("throws with diagnostic detail when content is empty (reasoning model hit max_tokens)", async () => {
    vi.stubEnv("ZAI_API_KEY", "zai-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: "",
                  reasoning_content:
                    "Step 1: understand the request. Step 2: formulate the output.",
                },
                finish_reason: "length",
              },
            ],
            usage: {
              completion_tokens: 50,
              completion_tokens_details: { reasoning_tokens: 50 },
            },
          }),
      })
    );

    let caught: Error | null = null;
    try {
      await provider.generateCompletion(
        [{ role: "user", content: "test" }],
        { model: "glm-5.1" }
      );
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    const msg = caught!.message;
    expect(msg).toContain("Invalid response format from Z.AI");
    expect(msg).toContain("finish_reason=length");
    expect(msg).toContain("completion_tokens=50");
    expect(msg).toContain("reasoning_tokens=50");
    // reasoning_content snippet must NOT appear in the thrown Error (PII /
    // log-injection risk) — it only goes to console.warn behind a debug flag.
    expect(msg).not.toContain("reasoning_snippet");
    expect(msg).not.toContain("Step 1");
  });

  it("renders 'unknown' tokens when usage object is missing", async () => {
    vi.stubEnv("ZAI_API_KEY", "zai-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "" }, finish_reason: "stop" }],
          }),
      })
    );

    await expect(
      provider.generateCompletion(
        [{ role: "user", content: "test" }],
        { model: "glm-5.1" }
      )
    ).rejects.toThrow(
      "Invalid response format from Z.AI: empty content (finish_reason=stop, completion_tokens=unknown, reasoning_tokens=unknown).",
    );
  });

  it.each([
    { label: "undefined", value: undefined },
    { label: "null", value: null },
    { label: "empty string", value: "" },
  ])("does not emit debug log when reasoning_content is $label (even with debug flag)", async ({ value }) => {
    vi.stubEnv("ZAI_API_KEY", "zai-test-key");
    vi.stubEnv(ZAI_DEBUG_REASONING_ENV, "1");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: { content: "", reasoning_content: value },
                  finish_reason: "length",
                },
              ],
              usage: { completion_tokens: 10 },
            }),
        })
      );

      await expect(
        provider.generateCompletion(
          [{ role: "user", content: "test" }],
          { model: "glm-5.1" }
        )
      ).rejects.toThrow(/Invalid response format/);

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("emits debug log with reasoning snippet only when ZAI_DEBUG_REASONING=1", async () => {
    vi.stubEnv("ZAI_API_KEY", "zai-test-key");
    vi.stubEnv(ZAI_DEBUG_REASONING_ENV, "1");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: "",
                    reasoning_content: "Long reasoning trace here",
                  },
                  finish_reason: "length",
                },
              ],
              usage: {
                completion_tokens: 50,
                completion_tokens_details: { reasoning_tokens: 50 },
              },
            }),
        })
      );

      await expect(
        provider.generateCompletion(
          [{ role: "user", content: "test" }],
          { model: "glm-5.1" }
        )
      ).rejects.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        "[zai] empty content with reasoning_content present",
        expect.objectContaining({
          finish_reason: "length",
          reasoning_snippet: "Long reasoning trace here",
        })
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not emit debug log when ZAI_DEBUG_REASONING is unset", async () => {
    vi.stubEnv("ZAI_API_KEY", "zai-test-key");
    vi.stubEnv(ZAI_DEBUG_REASONING_ENV, "");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: { content: "", reasoning_content: "trace" },
                  finish_reason: "length",
                },
              ],
              usage: { completion_tokens: 50 },
            }),
        })
      );

      await expect(
        provider.generateCompletion(
          [{ role: "user", content: "test" }],
          { model: "glm-5.1" }
        )
      ).rejects.toThrow();

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
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
