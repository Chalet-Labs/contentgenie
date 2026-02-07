import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseJsonResponse, generateCompletion } from "@/lib/openrouter";

describe("parseJsonResponse", () => {
  it("parses plain JSON", () => {
    const result = parseJsonResponse<{ foo: string }>(
      '{"foo": "bar"}'
    );
    expect(result).toEqual({ foo: "bar" });
  });

  it("strips ```json wrapper", () => {
    const result = parseJsonResponse<{ key: number }>(
      '```json\n{"key": 42}\n```'
    );
    expect(result).toEqual({ key: 42 });
  });

  it("strips ``` wrapper without language tag", () => {
    const result = parseJsonResponse<{ a: boolean }>(
      '```\n{"a": true}\n```'
    );
    expect(result).toEqual({ a: true });
  });

  it("handles whitespace around content", () => {
    const result = parseJsonResponse<{ x: string }>(
      '  \n  {"x": "y"}  \n  '
    );
    expect(result).toEqual({ x: "y" });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonResponse("not json")).toThrow();
  });

  it("throws on empty string", () => {
    expect(() => parseJsonResponse("")).toThrow();
  });
});

describe("generateCompletion", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("throws when API key is missing", async () => {
    process.env.OPENROUTER_API_KEY = "";
    await expect(
      generateCompletion([{ role: "user", content: "test" }])
    ).rejects.toThrow("OpenRouter API key is not configured");
  });

  it("sends correct headers and body", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "response" } }],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await generateCompletion(
      [{ role: "user", content: "hello" }],
      { model: "test-model", maxTokens: 100, temperature: 0.5 }
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(options.headers.Authorization).toBe("Bearer test-key");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["X-Title"]).toBe("ContentGenie");

    const body = JSON.parse(options.body);
    expect(body.model).toBe("test-model");
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(body.max_tokens).toBe(100);
    expect(body.temperature).toBe(0.5);
  });

  it("returns content from response", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
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

    const result = await generateCompletion([
      { role: "user", content: "test" },
    ]);
    expect(result).toBe("hello world");
  });

  it("throws on non-ok response", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limited"),
      })
    );

    await expect(
      generateCompletion([{ role: "user", content: "test" }])
    ).rejects.toThrow("OpenRouter API error: 429 - Rate limited");
  });

  it("throws when no choices returned", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      })
    );

    await expect(
      generateCompletion([{ role: "user", content: "test" }])
    ).rejects.toThrow("No response from OpenRouter");
  });

  it("uses default model and params when not specified", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "ok" } }],
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await generateCompletion([{ role: "user", content: "test" }]);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("google/gemini-flash-1.5");
    expect(body.max_tokens).toBe(2048);
    expect(body.temperature).toBe(0.7);
  });
});
