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
  inArray: vi.fn((col: unknown, vals: unknown) => ({
    type: "inArray",
    col,
    vals,
  })),
}));

// tasks.batchTrigger returns { batchId, runCount, publicAccessToken } — no .runs array
vi.mock("@trigger.dev/sdk", () => ({
  tasks: {
    batchTrigger: vi.fn().mockResolvedValue({
      batchId: "batch-123",
      runCount: 2,
      publicAccessToken: "batch-token",
    }),
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

// Mock the db.select().from().where() chain for episode lookup
function mockEpisodeSelect(results: unknown[]) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(results),
    }),
  });
}

function makeEpisode(id: number, podcastIndexId: string) {
  return {
    id,
    podcastIndexId,
    audioUrl: `https://example.com/audio-${id}.mp3`,
    description: `Episode ${id} description`,
    transcriptStatus: null,
  };
}

function makeRequest(body: unknown) {
  return new NextRequest(
    "http://localhost:3000/api/episodes/batch-fetch-transcripts",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/episodes/batch-fetch-transcripts", () => {
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

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const response = await POST(makeRequest({ episodeIds: [1, 2] }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when authenticated but not admin", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "user_1",
      has: vi.fn().mockReturnValue(false),
    } as never);

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const response = await POST(makeRequest({ episodeIds: [1, 2] }));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns 400 for empty episodeIds array", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const response = await POST(makeRequest({ episodeIds: [] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("episodeIds must be a non-empty array");
  });

  it("returns 400 when episodeIds is not an array", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const response = await POST(makeRequest({ episodeIds: 42 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("episodeIds must be a non-empty array");
  });

  it("returns 400 when episodeIds exceeds 20", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);

    const ids = Array.from({ length: 21 }, (_, i) => i + 1);
    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const response = await POST(makeRequest({ episodeIds: ids }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Maximum 20 unique episodes per batch");
  });

  it("returns 400 when episodeIds contains non-integers", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const response = await POST(makeRequest({ episodeIds: [1, 2.5, 3] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("All episode IDs must be positive integers");
  });

  it("returns 400 when episodeIds contains negative values", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const response = await POST(makeRequest({ episodeIds: [1, -2] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("All episode IDs must be positive integers");
  });

  it("returns 400 when any episode IDs are not found in DB", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    // Only returns 1 of the 2 requested episodes
    mockEpisodeSelect([makeEpisode(1, "111")]);

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const response = await POST(makeRequest({ episodeIds: [1, 2] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/not found/i);
    expect(data.error).toContain("2");
  });

  it("returns 202 with batchId and runCount on success", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect([makeEpisode(1, "111"), makeEpisode(2, "222")]);

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const response = await POST(makeRequest({ episodeIds: [1, 2] }));
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.batchId).toBe("batch-123");
    expect(data.publicAccessToken).toBe("batch-token");
    expect(data.total).toBe(2);
  });

  it("uses tasks.batchTrigger (not individual triggers)", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect([makeEpisode(1, "111"), makeEpisode(2, "222")]);

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    await POST(makeRequest({ episodeIds: [1, 2] }));

    const { tasks } = await import("@trigger.dev/sdk");
    expect(tasks.batchTrigger).toHaveBeenCalledTimes(1);
    expect(tasks.batchTrigger).toHaveBeenCalledWith(
      "fetch-transcript",
      expect.any(Array),
    );
  });

  it("sets transcriptStatus to 'fetching' for all episodes before triggering", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect([makeEpisode(1, "111"), makeEpisode(2, "222")]);
    const { setMock } = mockUpdateChain();

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    await POST(makeRequest({ episodeIds: [1, 2] }));

    expect(db.update).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptStatus: "fetching",
        transcriptError: null,
      }),
    );
  });

  it("task payloads use Number(podcastIndexId) as episodeId, not episodes.id", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect([makeEpisode(1, "11111"), makeEpisode(2, "22222")]);

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    await POST(makeRequest({ episodeIds: [1, 2] }));

    const { tasks } = await import("@trigger.dev/sdk");
    const callArg = vi.mocked(tasks.batchTrigger).mock.calls[0][1] as Array<{
      payload: { episodeId: number; force: boolean };
    }>;
    expect(callArg[0].payload.episodeId).toBe(11111); // Number("11111"), not 1
    expect(callArg[1].payload.episodeId).toBe(22222); // Number("22222"), not 2
    expect(callArg[0].payload.force).toBe(true);
    expect(callArg[1].payload.force).toBe(true);
  });

  it("publicAccessToken comes from batchResult (not a separate auth call)", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    mockEpisodeSelect([makeEpisode(1, "111"), makeEpisode(2, "222")]);

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const response = await POST(makeRequest({ episodeIds: [1, 2] }));
    const data = await response.json();

    // publicAccessToken is taken directly from batchResult, not generated via auth.createPublicToken
    expect(data.publicAccessToken).toBe("batch-token");
    expect(data.batchId).toBe("batch-123");
  });

  it("accepts exactly 20 episodes (the maximum)", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    const episodes = ids.map((id) => makeEpisode(id, String(id * 100)));
    mockEpisodeSelect(episodes);

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const response = await POST(makeRequest({ episodeIds: ids }));

    expect(response.status).toBe(202);
  });

  it("returns 400 for malformed JSON body", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: "admin_1",
      has: vi.fn().mockReturnValue(true),
    } as never);

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const badRequest = new NextRequest(
      "http://localhost:3000/api/episodes/batch-fetch-transcripts",
      {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      },
    );
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
    mockEpisodeSelect([makeEpisode(1, "111"), makeEpisode(2, "222")]);
    const { tasks } = await import("@trigger.dev/sdk");
    vi.mocked(tasks.batchTrigger).mockRejectedValue(
      new Error("Trigger.dev down"),
    );

    const { POST } =
      await import("@/app/api/episodes/batch-fetch-transcripts/route");
    const response = await POST(makeRequest({ episodeIds: [1, 2] }));

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Failed to trigger batch transcript fetch");
  });
});
