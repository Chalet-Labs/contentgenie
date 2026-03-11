import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock Clerk auth
const mockAuth = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}))

// Mock database
const mockInsert = vi.fn()
const mockValues = vi.fn()
const mockOnConflictDoUpdate = vi.fn()

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args)
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs)
          return {
            onConflictDoUpdate: (opts: unknown) => {
              mockOnConflictDoUpdate(opts)
              return Promise.resolve()
            },
          }
        },
      }
    },
  },
}))

// Mock schema
vi.mock("@/db/schema", () => ({
  listenHistory: {
    userId: "userId",
    episodeId: "episodeId",
    podcastIndexEpisodeId: "podcastIndexEpisodeId",
    startedAt: "startedAt",
    completedAt: "completedAt",
    listenDurationSeconds: "listenDurationSeconds",
    updatedAt: "updatedAt",
  },
}))

// Mock drizzle-orm sql tag
vi.mock("drizzle-orm", () => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    _sql: strings.join("?"),
    _values: values,
  })),
}))

describe("recordListenEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: "user_123" })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns { success: false } when not authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const { recordListenEvent } = await import("@/app/actions/listen-history")
    const result = await recordListenEvent({
      episodeId: 1,
      podcastIndexEpisodeId: 12345,
      started: true,
    })
    expect(result).toEqual({ success: false })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it("calls db.insert with correct values for a started event", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history")
    const result = await recordListenEvent({
      episodeId: 42,
      podcastIndexEpisodeId: 99999,
      started: true,
    })
    expect(result).toEqual({ success: true })
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockValues).toHaveBeenCalledTimes(1)
    const insertedValues = mockValues.mock.calls[0][0]
    expect(insertedValues).toMatchObject({
      userId: "user_123",
      episodeId: 42,
      podcastIndexEpisodeId: 99999,
    })
    expect(insertedValues.startedAt).toBeInstanceOf(Date)
  })

  it("calls db.insert with correct values for a completed event", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history")
    const result = await recordListenEvent({
      episodeId: 7,
      podcastIndexEpisodeId: 777,
      completed: true,
      durationSeconds: 1800,
    })
    expect(result).toEqual({ success: true })
    expect(mockInsert).toHaveBeenCalledTimes(1)
    const insertedValues = mockValues.mock.calls[0][0]
    expect(insertedValues).toMatchObject({
      userId: "user_123",
      episodeId: 7,
      podcastIndexEpisodeId: 777,
    })
    expect(insertedValues.startedAt).toBeInstanceOf(Date)
  })

  it("uses onConflictDoUpdate for upsert semantics", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history")
    await recordListenEvent({
      episodeId: 1,
      podcastIndexEpisodeId: 111,
      started: true,
    })
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1)
    const upsertOpts = mockOnConflictDoUpdate.mock.calls[0][0]
    // Conflict target must include both userId and episodeId columns
    expect(upsertOpts).toHaveProperty("target")
    expect(Array.isArray(upsertOpts.target)).toBe(true)
    expect(upsertOpts.target).toHaveLength(2)
    expect(upsertOpts).toHaveProperty("set")
    // updatedAt must always be refreshed
    expect(upsertOpts.set).toHaveProperty("updatedAt")
  })

  it("returns { success: false } when episodeId is not a positive integer", async () => {
    const { recordListenEvent } = await import("@/app/actions/listen-history")
    const result = await recordListenEvent({
      episodeId: -1,
      podcastIndexEpisodeId: 111,
      started: true,
    })
    expect(result).toEqual({ success: false })
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
