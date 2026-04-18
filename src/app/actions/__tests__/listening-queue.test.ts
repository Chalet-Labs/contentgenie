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
const mockDelete = vi.fn()
const mockDeleteWhere = vi.fn()
const mockFindMany = vi.fn()
const mockTx = {
  insert: (...args: unknown[]) => {
    mockInsert(...args)
    return {
      values: (...vArgs: unknown[]) => {
        return mockInsertValues(...vArgs)
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
}
const mockTransaction = vi.fn()

vi.mock("@/db", () => ({
  db: {
    transaction: (...args: unknown[]) => mockTransaction(...args),
    insert: (...args: unknown[]) => {
      mockInsert(...args)
      return {
        values: (...vArgs: unknown[]) => {
          return mockInsertValues(...vArgs)
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
      userQueueItems: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
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
  userQueueItems: {
    userId: "userId",
    episodeId: "episodeId",
    position: "position",
    title: "title",
    podcastTitle: "podcastTitle",
    audioUrl: "audioUrl",
    artwork: "artwork",
    duration: "duration",
    chaptersUrl: "chaptersUrl",
    updatedAt: "updatedAt",
  },
}))

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  asc: vi.fn((col: unknown) => ({ col, direction: "asc" })),
}))

const validEpisode: AudioEpisode = {
  id: "ep-1",
  title: "Test Episode",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://example.com/art.jpg",
  duration: 600,
}

const validEpisode2: AudioEpisode = {
  id: "ep-2",
  title: "Test Episode 2",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/audio2.mp3",
}

describe("getQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockFindMany.mockResolvedValue([])
    mockEnsureUserExists.mockResolvedValue(undefined)
    mockInsertValues.mockResolvedValue(undefined)
    mockDeleteWhere.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns { success: false, error } when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const { getQueue } = await import("@/app/actions/listening-queue")
    const result = await getQueue()
    expect(result.success).toBe(false)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it("returns { success: true, data: [] } when user has no rows", async () => {
    mockFindMany.mockResolvedValue([])
    const { getQueue } = await import("@/app/actions/listening-queue")
    const result = await getQueue()
    expect(result).toEqual({ success: true, data: [] })
  })

  it("does not call ensureUserExists (read-only path)", async () => {
    const { getQueue } = await import("@/app/actions/listening-queue")
    await getQueue()
    expect(mockEnsureUserExists).not.toHaveBeenCalled()
  })

  it("maps DB rows back to AudioEpisode[] ordered by position ASC", async () => {
    const dbRows = [
      {
        id: 1,
        userId: "user_123",
        position: 0,
        episodeId: "ep-1",
        title: "Test Episode",
        podcastTitle: "Test Podcast",
        audioUrl: "https://example.com/audio.mp3",
        artwork: "https://example.com/art.jpg",
        duration: 600,
        chaptersUrl: null,
        updatedAt: new Date(),
      },
      {
        id: 2,
        userId: "user_123",
        position: 1,
        episodeId: "ep-2",
        title: "Test Episode 2",
        podcastTitle: "Test Podcast",
        audioUrl: "https://example.com/audio2.mp3",
        artwork: null,
        duration: null,
        chaptersUrl: null,
        updatedAt: new Date(),
      },
    ]
    mockFindMany.mockResolvedValue(dbRows)
    const { getQueue } = await import("@/app/actions/listening-queue")
    const result = await getQueue()
    expect(result.success).toBe(true)
    if (!result.success) throw new Error("should be success")
    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toEqual({
      id: "ep-1",
      title: "Test Episode",
      podcastTitle: "Test Podcast",
      audioUrl: "https://example.com/audio.mp3",
      artwork: "https://example.com/art.jpg",
      duration: 600,
    })
    expect(result.data[1]).toEqual({
      id: "ep-2",
      title: "Test Episode 2",
      podcastTitle: "Test Podcast",
      audioUrl: "https://example.com/audio2.mp3",
    })
    // Verify orderBy was passed with asc
    const findManyCall = mockFindMany.mock.calls[0][0]
    expect(findManyCall).toHaveProperty("orderBy")
  })

  it("returns { success: false, error } on DB error", async () => {
    mockFindMany.mockRejectedValue(new Error("DB failure"))
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { getQueue } = await import("@/app/actions/listening-queue")
    const result = await getQueue()
    expect(result.success).toBe(false)
    expect(consoleSpy).toHaveBeenCalled()
  })
})

describe("setQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: "user_123" })
    mockEnsureUserExists.mockResolvedValue(undefined)
    mockInsertValues.mockResolvedValue(undefined)
    mockDeleteWhere.mockResolvedValue(undefined)
    mockTransaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => {
      await fn(mockTx)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns { success: false, error } when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const { setQueue } = await import("@/app/actions/listening-queue")
    const result = await setQueue([validEpisode])
    expect(result.success).toBe(false)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it("Zod-rejects an invalid payload without touching the DB", async () => {
    const { setQueue } = await import("@/app/actions/listening-queue")
    // audioUrl is not a valid URL
    const badEpisode = { id: "ep-1", title: "T", podcastTitle: "P", audioUrl: "not-a-url" }
    const result = await setQueue([badEpisode as AudioEpisode])
    expect(result.success).toBe(false)
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockEnsureUserExists).not.toHaveBeenCalled()
  })

  it("calls db.transaction, with DELETE before INSERT", async () => {
    const { setQueue } = await import("@/app/actions/listening-queue")
    await setQueue([validEpisode, validEpisode2])
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    const deleteOrder = mockDelete.mock.invocationCallOrder[0]
    const insertOrder = mockInsert.mock.invocationCallOrder[0]
    expect(deleteOrder).toBeLessThan(insertOrder)
  })

  it("inserts rows with position = 0, 1, 2 and explicit updatedAt Date", async () => {
    const { setQueue } = await import("@/app/actions/listening-queue")
    await setQueue([validEpisode, validEpisode2])
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const rows = mockInsertValues.mock.calls[0][0]
    expect(rows).toHaveLength(2)
    expect(rows[0].position).toBe(0)
    expect(rows[1].position).toBe(1)
    expect(rows[0].updatedAt).toBeInstanceOf(Date)
    expect(rows[1].updatedAt).toBeInstanceOf(Date)
  })

  it("with empty array produces only DELETE (no INSERT)", async () => {
    const { setQueue } = await import("@/app/actions/listening-queue")
    await setQueue([])
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it("calls ensureUserExists before the transaction", async () => {
    const { setQueue } = await import("@/app/actions/listening-queue")
    await setQueue([validEpisode])
    expect(mockEnsureUserExists).toHaveBeenCalledWith("user_123")
    const ensureOrder = mockEnsureUserExists.mock.invocationCallOrder[0]
    const txOrder = mockTransaction.mock.invocationCallOrder[0]
    expect(ensureOrder).toBeLessThan(txOrder)
  })

  it("returns { success: false, error } on DB error and calls console.error", async () => {
    mockTransaction.mockRejectedValue(new Error("DB failure"))
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { setQueue } = await import("@/app/actions/listening-queue")
    const result = await setQueue([validEpisode])
    expect(result.success).toBe(false)
    expect(consoleSpy).toHaveBeenCalled()
  })
})

describe("clearQueue", () => {
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
    const { clearQueue } = await import("@/app/actions/listening-queue")
    const result = await clearQueue()
    expect(result.success).toBe(false)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("issues DELETE WHERE userId = $user on success", async () => {
    const { clearQueue } = await import("@/app/actions/listening-queue")
    const result = await clearQueue()
    expect(result).toEqual({ success: true })
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
  })

  it("does not call ensureUserExists (DELETE is no-op on nonexistent user)", async () => {
    const { clearQueue } = await import("@/app/actions/listening-queue")
    await clearQueue()
    expect(mockEnsureUserExists).not.toHaveBeenCalled()
  })

  it("returns { success: false, error } on DB error", async () => {
    mockDeleteWhere.mockRejectedValue(new Error("DB failure"))
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { clearQueue } = await import("@/app/actions/listening-queue")
    const result = await clearQueue()
    expect(result.success).toBe(false)
    expect(consoleSpy).toHaveBeenCalled()
  })
})
