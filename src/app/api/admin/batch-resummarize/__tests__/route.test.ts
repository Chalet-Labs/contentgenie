import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}))

const mockBatchTrigger = vi.fn()
vi.mock("@trigger.dev/sdk", () => ({
  tasks: { batchTrigger: (...args: unknown[]) => mockBatchTrigger(...args) },
}))

const mockSelect = vi.fn()
const mockUpdate = vi.fn()
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}))

vi.mock("@/db/schema", () => ({
  episodes: {
    id: "id",
    transcriptStatus: "transcript_status",
    summaryStatus: "summary_status",
    updatedAt: "updated_at",
    podcastIndexId: "podcast_index_id",
  },
}))

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ eq: [col, val] })),
  inArray: vi.fn((col, vals) => ({ inArray: [col, vals] })),
}))

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {}
  const methods = ["from", "where"]
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain)
  })
  chain["then"] = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve)
  return chain
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {}
  chain["set"] = vi.fn(() => chain)
  chain["where"] = vi.fn(() => Promise.resolve())
  return chain
}

import { POST } from "@/app/api/admin/batch-resummarize/route"

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/batch-resummarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/admin/batch-resummarize", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: "user_1", has: () => true })
    mockBatchTrigger.mockResolvedValue(undefined)
    mockUpdate.mockReturnValue(makeUpdateChain())
  })

  it("returns 403 for non-admin", async () => {
    mockAuth.mockResolvedValue({ userId: "user_1", has: () => false })
    const res = await POST(makeRequest({ episodeIds: [1] }))
    expect(res.status).toBe(403)
  })

  it("returns 400 for empty episodeIds array", async () => {
    const res = await POST(makeRequest({ episodeIds: [] }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when episodeIds is not an array", async () => {
    const res = await POST(makeRequest({ episodeIds: "1,2,3" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when episodeIds exceeds 100", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1)
    const res = await POST(makeRequest({ episodeIds: ids }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/100/)
  })

  it("returns 400 for negative or non-integer IDs", async () => {
    const res = await POST(makeRequest({ episodeIds: [-1, 0, 1.5] }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/admin/batch-resummarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("skips episodes without transcript and returns correct counts", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([
        { id: 1, transcriptStatus: "available", summaryStatus: null, podcastIndexId: "100" },
        { id: 2, transcriptStatus: "missing", summaryStatus: null, podcastIndexId: "200" },
      ])
    )

    const res = await POST(makeRequest({ episodeIds: [1, 2] }))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.queued).toBe(1)
    expect(body.skipped).toBe(1)
  })

  it("skips episodes already in-progress (queued, running, summarizing)", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([
        { id: 1, transcriptStatus: "available", summaryStatus: "queued", podcastIndexId: "100" },
        { id: 2, transcriptStatus: "available", summaryStatus: "running", podcastIndexId: "200" },
        { id: 3, transcriptStatus: "available", summaryStatus: "summarizing", podcastIndexId: "300" },
        { id: 4, transcriptStatus: "available", summaryStatus: "completed", podcastIndexId: "400" },
        { id: 5, transcriptStatus: "available", summaryStatus: null, podcastIndexId: "500" },
      ])
    )

    const res = await POST(makeRequest({ episodeIds: [1, 2, 3, 4, 5] }))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.queued).toBe(2)
    expect(body.skipped).toBe(3)
    expect(mockBatchTrigger).toHaveBeenCalledWith(
      "summarize-episode",
      expect.arrayContaining([
        { payload: { episodeId: 400 } },
        { payload: { episodeId: 500 } },
      ])
    )
  })

  it("reverts queued status if task triggering fails", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([
        { id: 1, transcriptStatus: "available", summaryStatus: null, podcastIndexId: "100" },
      ])
    )
    mockBatchTrigger.mockRejectedValue(new Error("Trigger.dev unavailable"))

    const res = await POST(makeRequest({ episodeIds: [1] }))
    expect(res.status).toBe(500)
    // update called twice: once to set "queued", once to revert to null
    expect(mockUpdate).toHaveBeenCalledTimes(2)
  })

  it("triggers tasks and updates statuses for valid IDs", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([
        { id: 1, transcriptStatus: "available", summaryStatus: null, podcastIndexId: "100" },
        { id: 2, transcriptStatus: "available", summaryStatus: null, podcastIndexId: "200" },
      ])
    )

    await POST(makeRequest({ episodeIds: [1, 2] }))

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockBatchTrigger).toHaveBeenCalledWith(
      "summarize-episode",
      expect.arrayContaining([
        { payload: { episodeId: 100 } },
        { payload: { episodeId: 200 } },
      ])
    )
  })
})
