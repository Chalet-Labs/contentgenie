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

import { POST } from "../route"

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
    mockAuth.mockResolvedValue({ has: () => true })
    mockBatchTrigger.mockResolvedValue(undefined)
    mockUpdate.mockReturnValue(makeUpdateChain())
  })

  it("returns 403 for non-admin", async () => {
    mockAuth.mockResolvedValue({ has: () => false })
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

  it("skips episodes without transcript and returns correct counts", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([
        { id: 1, transcriptStatus: "available" },
        { id: 2, transcriptStatus: "missing" },
      ])
    )

    const res = await POST(makeRequest({ episodeIds: [1, 2] }))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.queued).toBe(1)
    expect(body.skipped).toBe(1)
  })

  it("triggers tasks and updates statuses for valid IDs", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([
        { id: 1, transcriptStatus: "available" },
        { id: 2, transcriptStatus: "available" },
      ])
    )

    await POST(makeRequest({ episodeIds: [1, 2] }))

    expect(mockUpdate).toHaveBeenCalled()
    expect(mockBatchTrigger).toHaveBeenCalledWith(
      "summarize-episode",
      expect.arrayContaining([
        { payload: { episodeId: 1 } },
        { payload: { episodeId: 2 } },
      ])
    )
  })
})
