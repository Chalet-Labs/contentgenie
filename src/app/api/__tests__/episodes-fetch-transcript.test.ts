import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

const mockDbSelect = vi.fn();
const mockDbQueryEpisodesFindFirst = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: vi.fn(),
    insert: vi.fn(),
    query: {
      episodes: {
        findFirst: (...args: unknown[]) => mockDbQueryEpisodesFindFirst(...args),
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: {
    id: "id",
    podcastIndexId: "podcast_index_id",
    audioUrl: "audio_url",
    description: "description",
    transcriptStatus: "transcript_status",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ type: "eq", col, val })),
}));

vi.mock("@trigger.dev/sdk", () => ({
  tasks: {
    trigger: vi.fn().mockResolvedValue({ id: "run_fetch123" }),
  },
  auth: {
    createPublicToken: vi.fn().mockResolvedValue("test-public-token"),
  },
}));

vi.mock("@/trigger/fetch-transcript", () => ({}));

vi.mock("@/db/helpers", () => ({
  upsertPodcast: vi.fn().mockResolvedValue(10),
}));

vi.mock("@/lib/podcastindex", () => ({
  getEpisodeById: vi.fn(),
  getPodcastById: vi.fn(),
}));

// Mock the db.update chain: update().set().where()
function mockUpdateChain() {
  const whereMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn().mockReturnValue({ where: whereMock });
  vi.mocked(db.update).mockReturnValue({ set: setMock } as never);
  return { setMock, whereMock };
}

// Mock the db.insert chain: insert().values().onConflictDoNothing()
function mockInsertChain() {
  const onConflictDoNothingMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });
  vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as never);
  return { valuesMock, onConflictDoNothingMock };
}

// Mock the db.select().from().where().limit() chain for episode lookup
function mockEpisodeSelect(result: unknown) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result].filter(Boolean)),
      }),
    }),
  });
}

function makeEpisode(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    podcastIndexId: "98765",
    audioUrl: "https://example.com/audio.mp3",
    description: "Episode description",
    transcriptStatus: null,
    ...overrides,
  };
}

function makePiEpisode(overrides: Record<string, unknown> = {}) {
  return {
    id: 98765,
    title: "Test Episode",
    description: "Episode description",
    enclosureUrl: "https://example.com/audio.mp3",
    duration: 3600,
    datePublished: 1700000000,
    feedId: 777,
    link: "",
    guid: "",
    datePublishedPretty: "",
    dateCrawled: 0,
    enclosureType: "audio/mpeg",
    enclosureLength: 0,
    explicit: 0,
    episode: null,
    episodeType: "full",
    season: 0,
    image: "",
    feedItunesId: null,
    feedImage: "",
    feedTitle: "Test Podcast",
    feedLanguage: "en",
    feedDead: 0,
    feedDuplicateOf: null,
    chaptersUrl: null,
    transcriptUrl: null,
    soundbite: null,
    soundbites: [],
    transcripts: [],
    ...overrides,
  };
}

function makePiPodcast(overrides: Record<string, unknown> = {}) {
  return {
    id: 777,
    title: "Test Podcast",
    description: "A podcast",
    author: "Author",
    ownerName: "Owner",
    image: "https://example.com/image.jpg",
    artwork: "https://example.com/artwork.jpg",
    url: "https://example.com/feed.rss",
    categories: { "1": "Technology" },
    episodeCount: 10,
    newestItemPubdate: 1700000000,
    podcastGuid: "",
    originalUrl: "",
    link: "",
    lastUpdateTime: 0,
    lastCrawlTime: 0,
    lastParseTime: 0,
    lastGoodHttpStatusTime: 0,
    lastHttpStatus: 200,
    contentType: "application/rss+xml",
    itunesId: null,
    itunesType: "",
    generator: "",
    language: "en",
    explicit: false,
    type: 0,
    medium: "podcast",
    dead: 0,
    crawlErrors: 0,
    parseErrors: 0,
    locked: 0,
    imageUrlHash: 0,
    ...overrides,
  };
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/episodes/fetch-transcript", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/episodes/fetch-transcript", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockUpdateChain();
    mockInsertChain();
    // Default: no existing episode row (for podcastIndexId path)
    mockDbQueryEpisodesFindFirst.mockResolvedValue(null);
    // Re-set Trigger.dev defaults — vi.clearAllMocks() wipes factory implementations
    const { tasks, auth: triggerAuth } = await import("@trigger.dev/sdk");
    vi.mocked(tasks.trigger).mockResolvedValue({ id: "run_fetch123" } as never);
    vi.mocked(triggerAuth.createPublicToken).mockResolvedValue("test-public-token" as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  // ─── Auth guards ───────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null, has: vi.fn() } as never);

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ episodeId: 5 }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when authenticated but not admin", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "user_1",
      has: vi.fn().mockReturnValue(false),
    } as never);

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ episodeId: 5 }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  // ─── episodeId path (existing behavior, backward-compatible) ──────────────

  it("returns 400 for missing episodeId (no podcastIndexId either)", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/episode ID/i);
  });

  it("returns 400 for non-integer episodeId", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ episodeId: 1.5 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/episode ID/i);
  });

  it("returns 400 for negative episodeId", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ episodeId: -3 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/episode ID/i);
  });

  it("returns 404 when episode not found by episodeId", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect(null);

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ episodeId: 999 }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Episode not found");
  });

  it("returns 202 with runId, publicAccessToken, and episodeDbId on success (episodeId path)", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect(makeEpisode());

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ episodeId: 5 }));
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.runId).toBe("run_fetch123");
    expect(data.publicAccessToken).toBe("test-public-token");
    expect(data.episodeDbId).toBe(5);
  });

  it("sets transcriptStatus to 'fetching' before triggering task (episodeId path)", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect(makeEpisode());
    const { setMock } = mockUpdateChain();

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    await POST(makeRequest({ episodeId: 5 }));

    expect(db.update).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ transcriptStatus: "fetching", transcriptError: null })
    );
  });

  it("task payload uses Number(podcastIndexId) as episodeId, not episodes.id", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect(makeEpisode({ id: 5, podcastIndexId: "98765" }));

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    await POST(makeRequest({ episodeId: 5 }));

    const { tasks } = await import("@trigger.dev/sdk");
    expect(tasks.trigger).toHaveBeenCalledWith(
      "fetch-transcript",
      expect.objectContaining({ episodeId: 98765 }) // Number("98765"), NOT 5
    );
  });

  it("task payload includes force: true", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect(makeEpisode());

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    await POST(makeRequest({ episodeId: 5 }));

    const { tasks } = await import("@trigger.dev/sdk");
    expect(tasks.trigger).toHaveBeenCalledWith(
      "fetch-transcript",
      expect.objectContaining({ force: true })
    );
  });

  it("looks up episode by episodes.id (primary key), not podcastIndexId", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect(makeEpisode());
    const { eq } = await import("drizzle-orm");

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    await POST(makeRequest({ episodeId: 5 }));

    // eq should be called with the "id" column (primary key), value 5
    expect(eq).toHaveBeenCalledWith("id", 5);
  });

  it("returns 400 for malformed JSON body", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const badRequest = new NextRequest("http://localhost:3000/api/episodes/fetch-transcript", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(badRequest);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid JSON body");
  });

  it("stores transcriptRunId in DB after triggering task", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect(makeEpisode());
    const { setMock } = mockUpdateChain();

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    await POST(makeRequest({ episodeId: 5 }));

    const allSetCalls = setMock.mock.calls;
    const runIdCall = allSetCalls.find((args: unknown[]) =>
      typeof args[0] === "object" && args[0] !== null && "transcriptRunId" in (args[0] as Record<string, unknown>)
    );
    expect(runIdCall).toBeDefined();
    expect((runIdCall![0] as Record<string, unknown>).transcriptRunId).toBe("run_fetch123");
  });

  it("returns 500 on unexpected error without leaking details", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect(makeEpisode());
    const { tasks } = await import("@trigger.dev/sdk");
    vi.mocked(tasks.trigger).mockRejectedValue(new Error("Trigger.dev down"));

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ episodeId: 5 }));

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Failed to trigger transcript fetch");
  });

  // ─── podcastIndexId path (new behavior) ───────────────────────────────────

  it("accepts podcastIndexId when no episodeId provided", async () => {
    const { getEpisodeById, getPodcastById } = await import("@/lib/podcastindex");
    vi.mocked(auth).mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) } as never);
    vi.mocked(getEpisodeById).mockResolvedValue({ status: "true", episode: makePiEpisode(), description: "" });
    vi.mocked(getPodcastById).mockResolvedValue({ status: "true", feed: makePiPodcast(), description: "" });
    // First call: lookup returns null; second call: post-insert re-query returns new row
    mockDbQueryEpisodesFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 7 });

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ podcastIndexId: "98765" }));

    expect(response.status).toBe(202);
  });

  it("creates episode row on demand when no DB row exists for podcastIndexId", async () => {
    const { getEpisodeById, getPodcastById } = await import("@/lib/podcastindex");
    vi.mocked(auth).mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) } as never);
    vi.mocked(getEpisodeById).mockResolvedValue({ status: "true", episode: makePiEpisode(), description: "" });
    vi.mocked(getPodcastById).mockResolvedValue({ status: "true", feed: makePiPodcast(), description: "" });
    mockDbQueryEpisodesFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 7 });

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    await POST(makeRequest({ podcastIndexId: "98765" }));

    expect(db.insert).toHaveBeenCalled();
  });

  it("returns episodeDbId in 202 response when called with podcastIndexId (new row)", async () => {
    const { getEpisodeById, getPodcastById } = await import("@/lib/podcastindex");
    vi.mocked(auth).mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) } as never);
    vi.mocked(getEpisodeById).mockResolvedValue({ status: "true", episode: makePiEpisode(), description: "" });
    vi.mocked(getPodcastById).mockResolvedValue({ status: "true", feed: makePiPodcast(), description: "" });
    mockDbQueryEpisodesFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 7 });

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ podcastIndexId: "98765" }));
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.episodeDbId).toBe(7);
  });

  it("reuses existing row when DB row already exists for podcastIndexId", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) } as never);
    // Existing row found on first lookup — no insert needed
    mockDbQueryEpisodesFindFirst.mockResolvedValue({ id: 5 });

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ podcastIndexId: "98765" }));
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.episodeDbId).toBe(5);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns 400 for RSS podcastIndexId (rss- prefix)", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) } as never);

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ podcastIndexId: "rss-abc123" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/non-numeric/i);
  });

  it("returns 400 for non-numeric podcastIndexId", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) } as never);

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ podcastIndexId: "not-a-number" }));
    const data = await response.json();

    expect(response.status).toBe(400);
  });

  it("returns 404 when PodcastIndex API returns no episode for podcastIndexId", async () => {
    const { getEpisodeById } = await import("@/lib/podcastindex");
    vi.mocked(auth).mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) } as never);
    vi.mocked(getEpisodeById).mockRejectedValue(new Error("Not found"));
    mockDbQueryEpisodesFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    const response = await POST(makeRequest({ podcastIndexId: "98765" }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toMatch(/not found/i);
  });

  it("uses podcastIndexId numeric value as task episodeId (podcastIndexId path)", async () => {
    const { getEpisodeById, getPodcastById } = await import("@/lib/podcastindex");
    vi.mocked(auth).mockResolvedValue({ userId: "admin_1", has: vi.fn().mockReturnValue(true) } as never);
    vi.mocked(getEpisodeById).mockResolvedValue({ status: "true", episode: makePiEpisode({ id: 98765 }), description: "" });
    vi.mocked(getPodcastById).mockResolvedValue({ status: "true", feed: makePiPodcast(), description: "" });
    mockDbQueryEpisodesFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 7 });

    const { POST } = await import("@/app/api/episodes/fetch-transcript/route");
    await POST(makeRequest({ podcastIndexId: "98765" }));

    const { tasks } = await import("@trigger.dev/sdk");
    expect(tasks.trigger).toHaveBeenCalledWith(
      "fetch-transcript",
      expect.objectContaining({ episodeId: 98765 })
    );
  });
});
