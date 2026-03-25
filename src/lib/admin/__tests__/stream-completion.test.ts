import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// We test streamCompletion by directly exercising the SSE parsing logic.
// We mock global fetch.

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import { streamCompletion } from "../stream-completion"

function makeSSEBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

async function collectStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let result = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }
  return result
}

describe("streamCompletion", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    vi.clearAllMocks()
    process.env.OPENROUTER_API_KEY = "test-key"
    process.env.ZAI_API_KEY = "test-key"
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete process.env.OPENROUTER_API_KEY
    delete process.env.ZAI_API_KEY
  })

  it("parses SSE chunks and extracts content", async () => {
    const sseLines = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: " world" } }] })}\n\n`,
      "data: [DONE]\n\n",
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSSEBody(sseLines),
    })

    const stream = await streamCompletion({
      provider: "openrouter",
      model: "gpt-4",
      messages: [{ role: "user", content: "test" }],
    })

    const result = await collectStream(stream)
    expect(result).toBe("Hello world")
  })

  it("handles [DONE] sentinel correctly", async () => {
    const sseLines = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "text" } }] })}\n\n`,
      "data: [DONE]\n\n",
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSSEBody(sseLines),
    })

    const stream = await streamCompletion({
      provider: "zai",
      model: "glm-4",
      messages: [{ role: "user", content: "test" }],
    })

    const result = await collectStream(stream)
    expect(result).toBe("text")
  })

  it("propagates API errors as rejected promise", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    })

    await expect(
      streamCompletion({
        provider: "openrouter",
        model: "gpt-4",
        messages: [{ role: "user", content: "test" }],
      })
    ).rejects.toThrow(/429/)
  })

  it("skips lines without delta content", async () => {
    const sseLines = [
      `data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "hi" } }] })}\n\n`,
      "data: [DONE]\n\n",
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSSEBody(sseLines),
    })

    const stream = await streamCompletion({
      provider: "openrouter",
      model: "gpt-4",
      messages: [],
    })

    const result = await collectStream(stream)
    expect(result).toBe("hi")
  })

  it("rejects when response.body is null", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: null,
    })

    await expect(
      streamCompletion({
        provider: "openrouter",
        model: "gpt-4",
        messages: [{ role: "user", content: "test" }],
      })
    ).rejects.toThrow(/No response body/)
  })

  it("rejects when API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY

    await expect(
      streamCompletion({
        provider: "openrouter",
        model: "gpt-4",
        messages: [{ role: "user", content: "test" }],
      })
    ).rejects.toThrow(/Missing API key/)
  })
})
