import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAuth = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}))

const mockSelect = vi.fn()
const mockEpisodesFindFirst = vi.fn()
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    query: {
      episodes: { findFirst: (...args: unknown[]) => mockEpisodesFindFirst(...args) },
    },
  },
}))

vi.mock("@/db/schema", () => ({
  episodes: {
    id: "id",
    transcriptStatus: "transcript_status",
    summaryStatus: "summary_status",
    title: "title",
    podcastId: "podcast_id",
  },
  podcasts: { id: "id", title: "title" },
}))

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ eq: [col, val] })),
  and: vi.fn((...args) => ({ and: args })),
  or: vi.fn((...args) => ({ or: args })),
  ilike: vi.fn((col, val) => ({ ilike: [col, val] })),
}))

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {}
  const methods = ["from", "innerJoin", "where", "limit"]
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain)
  })
  chain["then"] = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve)
  return chain
}

import { searchEpisodesWithTranscript, getEpisodeStatus } from "../admin"

describe("searchEpisodesWithTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ has: () => true })
    mockSelect.mockReturnValue(makeSelectChain([]))
  })

  it("returns error for non-admin", async () => {
    mockAuth.mockResolvedValue({ has: () => false })
    const result = await searchEpisodesWithTranscript("test")
    expect(result.error).toBe("Admin access required")
    expect(result.results).toHaveLength(0)
  })

  it("returns correct shape for admin", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([{ id: 1, title: "Episode", podcastTitle: "Podcast" }])
    )
    const result = await searchEpisodesWithTranscript("test")
    expect(result.error).toBeUndefined()
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toEqual({ id: 1, title: "Episode", podcastTitle: "Podcast" })
  })

  it("escapes % _ \\ metacharacters in ilike patterns", async () => {
    const { ilike } = await import("drizzle-orm")
    mockSelect.mockReturnValue(makeSelectChain([]))
    await searchEpisodesWithTranscript("100% done_here\\path")
    const calls = vi.mocked(ilike).mock.calls
    expect(calls[0][1]).toBe("%100\\% done\\_here\\\\path%")
    expect(calls[1][1]).toBe("%100\\% done\\_here\\\\path%")
  })
})

describe("getEpisodeStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ has: () => true })
  })

  it("returns null for non-admin", async () => {
    mockAuth.mockResolvedValue({ has: () => false })
    const result = await getEpisodeStatus(1)
    expect(result).toBeNull()
  })

  it("returns status for existing episode", async () => {
    mockEpisodesFindFirst.mockResolvedValue({
      transcriptStatus: "available",
      summaryStatus: "completed",
    })
    const result = await getEpisodeStatus(1)
    expect(result).toEqual({ transcriptStatus: "available", summaryStatus: "completed" })
  })

  it("returns null for missing episode", async () => {
    mockEpisodesFindFirst.mockResolvedValue(undefined)
    const result = await getEpisodeStatus(999)
    expect(result).toBeNull()
  })
})
