import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}))

const mockEpisodesFindFirst = vi.fn()
vi.mock("@/db", () => ({
  db: {
    query: {
      episodes: { findFirst: (...args: unknown[]) => mockEpisodesFindFirst(...args) },
    },
  },
}))

vi.mock("@/db/schema", () => ({
  episodes: { id: "id" },
}))

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ eq: [col, val] })),
}))

const mockGetActiveAiConfig = vi.fn()
vi.mock("@/lib/ai/config", () => ({
  getActiveAiConfig: () => mockGetActiveAiConfig(),
}))

vi.mock("@/lib/prompts", () => ({
  SYSTEM_PROMPT: "system prompt",
}))

vi.mock("@/lib/admin/prompt-utils", () => ({
  interpolatePrompt: vi.fn((template: string) => `interpolated: ${template}`),
}))

const mockStreamCompletion = vi.fn()
vi.mock("@/lib/admin/stream-completion", () => ({
  streamCompletion: (...args: unknown[]) => mockStreamCompletion(...args),
}))

import { POST } from "../route"

const validEpisode = {
  id: 1,
  title: "Test Episode",
  description: "A test",
  duration: 3600,
  transcriptStatus: "available",
  transcription: "Full transcript here.",
  podcast: { title: "Test Podcast" },
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/test-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/admin/test-prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ has: () => true })
    mockEpisodesFindFirst.mockResolvedValue(validEpisode)
    mockGetActiveAiConfig.mockResolvedValue({ provider: "openrouter", model: "gpt-4" })
    mockStreamCompletion.mockReturnValue(new ReadableStream())
  })

  it("returns 403 for non-admin", async () => {
    mockAuth.mockResolvedValue({ has: () => false })
    const res = await POST(makeRequest({ prompt: "test {{transcript}}", episodeId: 1 }))
    expect(res.status).toBe(403)
  })

  it("returns 422 when prompt is missing {{transcript}}", async () => {
    const res = await POST(makeRequest({ prompt: "no placeholder here", episodeId: 1 }))
    expect(res.status).toBe(422)
    expect(await res.text()).toMatch(/transcript/)
  })

  it("returns 422 when episode has no transcript", async () => {
    mockEpisodesFindFirst.mockResolvedValue({
      ...validEpisode,
      transcriptStatus: "missing",
      transcription: null,
    })
    const res = await POST(makeRequest({ prompt: "{{transcript}}", episodeId: 1 }))
    expect(res.status).toBe(422)
  })

  it("returns 422 when episode not found", async () => {
    mockEpisodesFindFirst.mockResolvedValue(undefined)
    const res = await POST(makeRequest({ prompt: "{{transcript}}", episodeId: 999 }))
    expect(res.status).toBe(422)
  })

  it("returns streaming response with correct Content-Type for valid request", async () => {
    const res = await POST(makeRequest({ prompt: "Analyze {{transcript}}", episodeId: 1 }))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toMatch(/text\/plain/)
  })
})
