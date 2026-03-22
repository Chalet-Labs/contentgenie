import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

const mockDbSelect = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: vi.fn(),
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

// Mock the db.update chain: update().set().where()
function mockUpdateChain() {
  const whereMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn().mockReturnValue({ where: whereMock });
  vi.mocked(db.update).mockReturnValue({ set: setMock } as never);
  return { setMock, whereMock };
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

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/episodes/fetch-transcript", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/episodes/fetch-transcript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateChain();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

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

  it("returns 400 for missing episodeId", async () => {
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

  it("returns 404 when episode not found", async () => {
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

  it("returns 202 with runId and publicAccessToken on success", async () => {
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
  });

  it("sets transcriptStatus to 'fetching' before triggering task", async () => {
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
});
