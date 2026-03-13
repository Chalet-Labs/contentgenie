import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock Clerk auth
const mockAuth = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}))

// Mock DB select chain
const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockWhere = vi.fn().mockResolvedValue([])

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args)
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs)
          return {
            where: (...wArgs: unknown[]) => mockWhere(...wArgs),
          }
        },
      }
    },
  },
}))

vi.mock("@/db/schema", () => ({
  episodes: {
    podcastIndexId: "podcastIndexId",
    worthItScore: "worthItScore",
  },
}))

vi.mock("drizzle-orm", () => ({
  inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
}))

describe("getQueueEpisodeScores", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockWhere.mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns empty object when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const { getQueueEpisodeScores } = await import("@/app/actions/queue-scores")
    const result = await getQueueEpisodeScores(["123", "456"])
    expect(result).toEqual({})
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("returns empty object for empty input", async () => {
    const { getQueueEpisodeScores } = await import("@/app/actions/queue-scores")
    const result = await getQueueEpisodeScores([])
    expect(result).toEqual({})
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("returns empty object when all IDs are empty strings", async () => {
    const { getQueueEpisodeScores } = await import("@/app/actions/queue-scores")
    const result = await getQueueEpisodeScores(["", "  ", ""])
    expect(result).toEqual({})
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("returns scores for matching episode IDs", async () => {
    mockWhere.mockReturnValue(
      Promise.resolve([
        { podcastIndexId: "111", worthItScore: "8.50" },
        { podcastIndexId: "222", worthItScore: "5.00" },
      ])
    )
    const { getQueueEpisodeScores } = await import("@/app/actions/queue-scores")
    const result = await getQueueEpisodeScores(["111", "222"])
    expect(result).toEqual({ "111": 8.5, "222": 5.0 })
  })

  it("returns null for IDs with no score (worthItScore is null)", async () => {
    mockWhere.mockReturnValue(
      Promise.resolve([
        { podcastIndexId: "333", worthItScore: null },
      ])
    )
    const { getQueueEpisodeScores } = await import("@/app/actions/queue-scores")
    const result = await getQueueEpisodeScores(["333"])
    expect(result).toEqual({ "333": null })
  })

  it("does not include IDs with no matching DB row in result", async () => {
    mockWhere.mockReturnValue(
      Promise.resolve([
        { podcastIndexId: "111", worthItScore: "7.00" },
        // "999" is not in the result — no DB row
      ])
    )
    const { getQueueEpisodeScores } = await import("@/app/actions/queue-scores")
    const result = await getQueueEpisodeScores(["111", "999"])
    expect(result).toEqual({ "111": 7.0 })
    expect(Object.hasOwn(result, "999")).toBe(false)
  })

  it("caps input at 50 IDs", async () => {
    const { inArray } = await import("drizzle-orm")
    const ids = Array.from({ length: 60 }, (_, i) => String(i + 1))
    const { getQueueEpisodeScores } = await import("@/app/actions/queue-scores")
    await getQueueEpisodeScores(ids)
    const passedIds = (inArray as ReturnType<typeof vi.fn>).mock.calls[0][1] as string[]
    expect(passedIds).toHaveLength(50)
  })

  it("returns empty object on DB error", async () => {
    mockWhere.mockReturnValue(Promise.reject(new Error("db failure")))
    const { getQueueEpisodeScores } = await import("@/app/actions/queue-scores")
    const result = await getQueueEpisodeScores(["111"])
    expect(result).toEqual({})
  })
})
