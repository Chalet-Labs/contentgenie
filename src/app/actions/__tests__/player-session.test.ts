import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { AudioEpisode } from "@/contexts/audio-player-context"

// Mock Clerk auth
const mockAuth = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}))

// Mock database
const mockInsert = vi.fn()
const mockInsertValues = vi.fn()
const mockOnConflictDoUpdate = vi.fn()
const mockDelete = vi.fn()
const mockDeleteWhere = vi.fn()
const mockFindFirst = vi.fn()

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args)
      return {
        values: (...vArgs: unknown[]) => {
          mockInsertValues(...vArgs)
          return {
            onConflictDoUpdate: (opts: unknown) => {
              return mockOnConflictDoUpdate(opts)
            },
          }
        },
      }
    },
    delete: (...args: unknown[]) => {
      mockDelete(...args)
      return {
        where: (...wArgs: unknown[]) => {
          return mockDeleteWhere(...wArgs)
        },
      }
    },
    query: {
      userPlayerSession: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}))

// Mock helpers
const mockEnsureUserExists = vi.fn()
vi.mock("@/db/helpers", () => ({
  ensureUserExists: (...args: unknown[]) => mockEnsureUserExists(...args),
}))

// Mock schema
vi.mock("@/db/schema", () => ({
  userPlayerSession: {
    userId: "userId",
    episodeId: "episodeId",
    title: "title",
    podcastTitle: "podcastTitle",
    audioUrl: "audioUrl",
    artwork: "artwork",
    duration: "duration",
    chaptersUrl: "chaptersUrl",
    currentTime: "currentTime",
    updatedAt: "updatedAt",
  },
}))

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
}))

const validEpisode: AudioEpisode = {
  id: "ep-1",
  title: "Test Episode",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://example.com/art.jpg",
  duration: 600,
}

describe("getPlayerSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockFindFirst.mockResolvedValue(null)
    mockEnsureUserExists.mockResolvedValue(undefined)
    mockOnConflictDoUpdate.mockResolvedValue(undefined)
    mockDeleteWhere.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns { success: false, error } when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const { getPlayerSession } = await import("@/app/actions/player-session")
    const result = await getPlayerSession()
    expect(result.success).toBe(false)
    expect(mockFindFirst).not.toHaveBeenCalled()
  })

  it("returns { success: true, data: null } when no row exists", async () => {
    mockFindFirst.mockResolvedValue(null)
    const { getPlayerSession } = await import("@/app/actions/player-session")
    const result = await getPlayerSession()
    expect(result).toEqual({ success: true, data: null })
  })

  it("does not call ensureUserExists (read-only path)", async () => {
    const { getPlayerSession } = await import("@/app/actions/player-session")
    await getPlayerSession()
    expect(mockEnsureUserExists).not.toHaveBeenCalled()
  })

  it("returns episode reassembled from denormalized columns with currentTime as number", async () => {
    const dbRow = {
      userId: "user_123",
      episodeId: "ep-1",
      title: "Test Episode",
      podcastTitle: "Test Podcast",
      audioUrl: "https://example.com/audio.mp3",
      artwork: "https://example.com/art.jpg",
      duration: 600,
      chaptersUrl: null,
      currentTime: "123.456",
      updatedAt: new Date(),
    }
    mockFindFirst.mockResolvedValue(dbRow)
    const { getPlayerSession } = await import("@/app/actions/player-session")
    const result = await getPlayerSession()
    expect(result.success).toBe(true)
    if (!result.success) throw new Error("should be success")
    expect(result.data).not.toBeNull()
    expect(result.data!.currentTime).toBe(123.456)
    expect(result.data!.episode).toEqual({
      id: "ep-1",
      title: "Test Episode",
      podcastTitle: "Test Podcast",
      audioUrl: "https://example.com/audio.mp3",
      artwork: "https://example.com/art.jpg",
      duration: 600,
    })
  })

  it("returns { success: false, error } on DB error", async () => {
    mockFindFirst.mockRejectedValue(new Error("DB failure"))
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { getPlayerSession } = await import("@/app/actions/player-session")
    const result = await getPlayerSession()
    expect(result.success).toBe(false)
    expect(consoleSpy).toHaveBeenCalled()
  })
})

describe("savePlayerSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockEnsureUserExists.mockResolvedValue(undefined)
    mockOnConflictDoUpdate.mockResolvedValue(undefined)
    mockDeleteWhere.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns { success: false, error } when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const { savePlayerSession } = await import("@/app/actions/player-session")
    const result = await savePlayerSession(validEpisode, 120)
    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it("Zod-rejects an invalid payload without touching the DB", async () => {
    const { savePlayerSession } = await import("@/app/actions/player-session")
    const badEpisode = { id: "ep-1", title: "T", podcastTitle: "P", audioUrl: "not-a-url" }
    const result = await savePlayerSession(badEpisode as AudioEpisode, 120)
    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockEnsureUserExists).not.toHaveBeenCalled()
  })

  it("Zod-rejects currentTime above the upper bound without touching the DB", async () => {
    const { savePlayerSession } = await import("@/app/actions/player-session")
    const result = await savePlayerSession(validEpisode, 1_000_001)
    expect(result.success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockEnsureUserExists).not.toHaveBeenCalled()
  })

  it("calls ensureUserExists before the insert", async () => {
    const { savePlayerSession } = await import("@/app/actions/player-session")
    await savePlayerSession(validEpisode, 120)
    expect(mockEnsureUserExists).toHaveBeenCalledWith("user_123")
    const ensureOrder = mockEnsureUserExists.mock.invocationCallOrder[0]
    const insertOrder = mockInsert.mock.invocationCallOrder[0]
    expect(ensureOrder).toBeLessThan(insertOrder)
  })

  it("uses onConflictDoUpdate targeting userPlayerSession.userId with updatedAt Date in set", async () => {
    const { savePlayerSession } = await import("@/app/actions/player-session")
    await savePlayerSession(validEpisode, 120)
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1)
    const opts = mockOnConflictDoUpdate.mock.calls[0][0]
    expect(opts).toHaveProperty("target")
    expect(opts).toHaveProperty("set")
    expect(opts.set.updatedAt).toBeInstanceOf(Date)
  })

  it("persists currentTime as a decimal string", async () => {
    const { savePlayerSession } = await import("@/app/actions/player-session")
    await savePlayerSession(validEpisode, 123.456)
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const insertedValues = mockInsertValues.mock.calls[0][0]
    expect(typeof insertedValues.currentTime).toBe("string")
    expect(insertedValues.currentTime).toMatch(/^\d+(\.\d+)?$/)
  })

  it("returns { success: false, error } on DB error", async () => {
    mockOnConflictDoUpdate.mockRejectedValue(new Error("DB failure"))
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { savePlayerSession } = await import("@/app/actions/player-session")
    const result = await savePlayerSession(validEpisode, 120)
    expect(result.success).toBe(false)
    expect(consoleSpy).toHaveBeenCalled()
  })
})

describe("clearPlayerSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockEnsureUserExists.mockResolvedValue(undefined)
    mockDeleteWhere.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns { success: false, error } when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const { clearPlayerSession } = await import("@/app/actions/player-session")
    const result = await clearPlayerSession()
    expect(result.success).toBe(false)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("issues DELETE WHERE userId = $user on success", async () => {
    const { clearPlayerSession } = await import("@/app/actions/player-session")
    const result = await clearPlayerSession()
    expect(result).toEqual({ success: true })
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
  })

  it("does not call ensureUserExists (DELETE is no-op on nonexistent user)", async () => {
    const { clearPlayerSession } = await import("@/app/actions/player-session")
    await clearPlayerSession()
    expect(mockEnsureUserExists).not.toHaveBeenCalled()
  })

  it("returns { success: false, error } on DB error", async () => {
    mockDeleteWhere.mockRejectedValue(new Error("DB failure"))
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { clearPlayerSession } = await import("@/app/actions/player-session")
    const result = await clearPlayerSession()
    expect(result.success).toBe(false)
    expect(consoleSpy).toHaveBeenCalled()
  })
})
