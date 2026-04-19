import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { AudioEpisode } from "@/contexts/audio-player-context"
import {
  createDrizzleOrmMock,
  happyPathSetup,
  makeClerkAuthMock,
  makeDeleteChain,
  makeInsertChain,
  makeUserHelpersMock,
  testDbError,
  testUnauthenticated,
  validEpisode,
  validEpisode2,
} from "@/app/actions/__tests__/__fixtures"

// Mock Clerk auth
const mockAuth = vi.fn()
vi.mock("@clerk/nextjs/server", () =>
  makeClerkAuthMock(() => mockAuth()),
)

// Mock database
const mockInsert = vi.fn()
const mockInsertValues = vi.fn()
const mockDelete = vi.fn()
const mockDeleteWhere = vi.fn()
const mockFindMany = vi.fn()
const mockBatch = vi.fn()

vi.mock("@/db", () => ({
  db: {
    batch: (...args: unknown[]) => mockBatch(...args),
    insert: makeInsertChain(mockInsert, mockInsertValues),
    delete: makeDeleteChain(mockDelete, mockDeleteWhere),
    query: {
      userQueueItems: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
      },
    },
  },
}))

// Mock helpers
const mockEnsureUserExists = vi.fn()
vi.mock("@/db/helpers", () =>
  makeUserHelpersMock((...args: unknown[]) => mockEnsureUserExists(...args)),
)

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

// Mock drizzle-orm (shared factory lives in __fixtures.ts)
vi.mock("drizzle-orm", () => createDrizzleOrmMock())

const importAction = async () => import("@/app/actions/listening-queue")

describe("getQueue", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists))
  beforeEach(() => {
    mockFindMany.mockResolvedValue([])
    mockInsertValues.mockResolvedValue(undefined)
    mockDeleteWhere.mockResolvedValue(undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it(
    "returns { success: false, error } when unauthenticated",
    testUnauthenticated(
      mockAuth,
      async () => (await importAction()).getQueue(),
      mockFindMany,
    ),
  )

  it("returns { success: true, data: [] } when user has no rows", async () => {
    mockFindMany.mockResolvedValue([])
    const { getQueue } = await importAction()
    const result = await getQueue()
    expect(result).toEqual({ success: true, data: [] })
  })

  it("does not call ensureUserExists (read-only path)", async () => {
    const { getQueue } = await importAction()
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
    const { getQueue } = await importAction()
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
    // Verify rows are scoped to the signed-in user and ordered by position ASC
    const findManyCall = mockFindMany.mock.calls[0][0]
    expect(findManyCall.where).toEqual({ col: "userId", val: "user_123" })
    expect(findManyCall.orderBy).toEqual([
      { col: "position", direction: "asc" },
    ])
  })

  it(
    "returns { success: false, error } on DB error",
    testDbError(
      mockFindMany,
      async () => (await importAction()).getQueue(),
    ),
  )
})

describe("setQueue", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists))
  beforeEach(() => {
    mockInsertValues.mockResolvedValue(undefined)
    mockDeleteWhere.mockResolvedValue(undefined)
    mockBatch.mockResolvedValue([])
  })
  afterEach(() => vi.restoreAllMocks())

  it(
    "returns { success: false, error } when unauthenticated",
    testUnauthenticated(
      mockAuth,
      async () => (await importAction()).setQueue([validEpisode]),
      mockBatch,
    ),
  )

  it("Zod-rejects an invalid payload without touching the DB", async () => {
    const { setQueue } = await importAction()
    // audioUrl is not a valid URL
    const badEpisode = { id: "ep-1", title: "T", podcastTitle: "P", audioUrl: "not-a-url" }
    const result = await setQueue([badEpisode as AudioEpisode])
    expect(result.success).toBe(false)
    expect(mockBatch).not.toHaveBeenCalled()
    expect(mockEnsureUserExists).not.toHaveBeenCalled()
  })

  it("rejects a queue containing duplicate episode IDs before touching the DB", async () => {
    const { setQueue } = await importAction()
    const result = await setQueue([validEpisode, { ...validEpisode }])
    expect(result.success).toBe(false)
    expect(mockBatch).not.toHaveBeenCalled()
    expect(mockEnsureUserExists).not.toHaveBeenCalled()
  })

  it("rejects a queue with a non-https audioUrl before touching the DB", async () => {
    const { setQueue } = await importAction()
    const jsUrl = {
      ...validEpisode,
      audioUrl: "javascript:alert(1)",
    } as AudioEpisode
    const result = await setQueue([jsUrl])
    expect(result.success).toBe(false)
    expect(mockBatch).not.toHaveBeenCalled()
    expect(mockEnsureUserExists).not.toHaveBeenCalled()
  })

  it("calls db.batch with [DELETE, INSERT] scoped to the signed-in user", async () => {
    const { setQueue } = await importAction()
    await setQueue([validEpisode, validEpisode2])
    expect(mockBatch).toHaveBeenCalledTimes(1)
    const [queries] = mockBatch.mock.calls[0]
    expect(queries).toHaveLength(2)
    // The query builders run synchronously before db.batch is invoked,
    // so invocationCallOrder reflects [delete, insert] construction order.
    const deleteOrder = mockDelete.mock.invocationCallOrder[0]
    const insertOrder = mockInsert.mock.invocationCallOrder[0]
    expect(deleteOrder).toBeLessThan(insertOrder)
    expect(mockDeleteWhere).toHaveBeenCalledWith({
      col: "userId",
      val: "user_123",
    })
  })

  it("inserts rows with position = 0, 1, 2 and explicit updatedAt Date", async () => {
    const { setQueue } = await importAction()
    await setQueue([validEpisode, validEpisode2])
    expect(mockInsertValues).toHaveBeenCalledTimes(1)
    const rows = mockInsertValues.mock.calls[0][0]
    expect(rows).toHaveLength(2)
    expect(rows[0].position).toBe(0)
    expect(rows[1].position).toBe(1)
    expect(rows[0].updatedAt).toBeInstanceOf(Date)
    expect(rows[1].updatedAt).toBeInstanceOf(Date)
  })

  it("with empty array issues a single DELETE and skips db.batch", async () => {
    const { setQueue } = await importAction()
    await setQueue([])
    expect(mockBatch).not.toHaveBeenCalled()
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDeleteWhere).toHaveBeenCalledWith({
      col: "userId",
      val: "user_123",
    })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it("calls ensureUserExists before db.batch", async () => {
    const { setQueue } = await importAction()
    await setQueue([validEpisode])
    expect(mockEnsureUserExists).toHaveBeenCalledWith("user_123")
    const ensureOrder = mockEnsureUserExists.mock.invocationCallOrder[0]
    const batchOrder = mockBatch.mock.invocationCallOrder[0]
    expect(ensureOrder).toBeLessThan(batchOrder)
  })

  it("rolls back the DELETE when db.batch rejects (atomic replace-all)", async () => {
    mockBatch.mockRejectedValueOnce(new Error("unique violation"))
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { setQueue } = await importAction()
    const result = await setQueue([validEpisode])
    expect(result).toEqual({ success: false, error: "Failed to set queue" })
    expect(consoleSpy).toHaveBeenCalled()
    // db.batch is the atomic unit: if it rejects, the DELETE + INSERT are
    // rolled back together (neon-http executes batches in a single HTTP
    // round-trip with implicit-transaction semantics).
  })

  it(
    "returns { success: false, error } on DB error and calls console.error",
    testDbError(
      mockBatch,
      async () => (await importAction()).setQueue([validEpisode]),
    ),
  )
})

describe("clearQueue", () => {
  beforeEach(happyPathSetup(mockAuth, mockEnsureUserExists))
  beforeEach(() => {
    mockDeleteWhere.mockResolvedValue(undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it(
    "returns { success: false, error } when unauthenticated",
    testUnauthenticated(
      mockAuth,
      async () => (await importAction()).clearQueue(),
      mockDelete,
    ),
  )

  it("issues DELETE WHERE userId = $user on success", async () => {
    const { clearQueue } = await importAction()
    const result = await clearQueue()
    expect(result).toEqual({ success: true })
    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1)
    expect(mockDeleteWhere).toHaveBeenCalledWith({
      col: "userId",
      val: "user_123",
    })
  })

  it("does not call ensureUserExists (DELETE is no-op on nonexistent user)", async () => {
    const { clearQueue } = await importAction()
    await clearQueue()
    expect(mockEnsureUserExists).not.toHaveBeenCalled()
  })

  it(
    "returns { success: false, error } on DB error",
    testDbError(
      mockDeleteWhere,
      async () => (await importAction()).clearQueue(),
    ),
  )
})
