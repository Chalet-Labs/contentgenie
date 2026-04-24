import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

const mockCreatePublicToken = vi.fn();
vi.mock("@trigger.dev/sdk", () => ({
  auth: {
    createPublicToken: (...args: unknown[]) => mockCreatePublicToken(...args),
  },
}));

const mockSelect = vi.fn();
const mockEpisodesFindFirst = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    query: {
      episodes: {
        findFirst: (...args: unknown[]) => mockEpisodesFindFirst(...args),
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: {
    id: "id",
    transcriptStatus: "transcript_status",
    summaryStatus: "summary_status",
    transcriptRunId: "transcript_run_id",
    summaryRunId: "summary_run_id",
    title: "title",
    podcastId: "podcast_id",
  },
  podcasts: { id: "id", title: "title" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ eq: [col, val] })),
  and: vi.fn((...args) => ({ and: args })),
  or: vi.fn((...args) => ({ or: args })),
  ilike: vi.fn((col, val) => ({ ilike: [col, val] })),
}));

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "innerJoin", "where", "limit"];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain["then"] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

import {
  searchEpisodesWithTranscript,
  getEpisodeStatus,
  getRunReconnectionData,
} from "@/app/actions/admin";

describe("searchEpisodesWithTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ has: () => true });
    mockSelect.mockReturnValue(makeSelectChain([]));
  });

  it("returns error for non-admin", async () => {
    mockAuth.mockResolvedValue({ has: () => false });
    const result = await searchEpisodesWithTranscript("test");
    expect(result.error).toBe("Admin access required");
    expect(result.results).toHaveLength(0);
  });

  it("returns correct shape for admin", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([{ id: 1, title: "Episode", podcastTitle: "Podcast" }]),
    );
    const result = await searchEpisodesWithTranscript("test");
    expect(result.error).toBeUndefined();
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      id: 1,
      title: "Episode",
      podcastTitle: "Podcast",
    });
  });

  it("escapes % _ \\ metacharacters in ilike patterns", async () => {
    const { ilike } = await import("drizzle-orm");
    mockSelect.mockReturnValue(makeSelectChain([]));
    await searchEpisodesWithTranscript("100% done_here\\path");
    const calls = vi.mocked(ilike).mock.calls;
    expect(calls[0][1]).toBe("%100\\% done\\_here\\\\path%");
    expect(calls[1][1]).toBe("%100\\% done\\_here\\\\path%");
  });
});

describe("getEpisodeStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ has: () => true });
  });

  it("returns error for non-admin", async () => {
    mockAuth.mockResolvedValue({ has: () => false });
    const result = await getEpisodeStatus(1);
    expect(result).toEqual({ ok: false, error: "Admin access required" });
  });

  it("returns status for existing episode", async () => {
    mockEpisodesFindFirst.mockResolvedValue({
      transcriptStatus: "available",
      summaryStatus: "completed",
      transcriptRunId: null,
      summaryRunId: null,
    });
    const result = await getEpisodeStatus(1);
    expect(result).toEqual({
      ok: true,
      transcriptStatus: "available",
      summaryStatus: "completed",
      transcriptRunId: null,
      summaryRunId: null,
    });
  });

  it("returns run IDs for in-progress episode", async () => {
    mockEpisodesFindFirst.mockResolvedValue({
      transcriptStatus: "fetching",
      summaryStatus: null,
      transcriptRunId: "run_transcript_abc",
      summaryRunId: null,
    });
    const result = await getEpisodeStatus(2);
    expect(result).toEqual({
      ok: true,
      transcriptStatus: "fetching",
      summaryStatus: null,
      transcriptRunId: "run_transcript_abc",
      summaryRunId: null,
    });
  });

  it("returns error for missing episode", async () => {
    mockEpisodesFindFirst.mockResolvedValue(undefined);
    const result = await getEpisodeStatus(999);
    expect(result).toEqual({ ok: false, error: "Episode not found" });
  });

  it("returns error on database failure", async () => {
    mockEpisodesFindFirst.mockRejectedValue(new Error("DB connection failed"));
    const result = await getEpisodeStatus(1);
    expect(result).toEqual({ ok: false, error: "Failed to check status" });
  });
});

describe("getRunReconnectionData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ has: () => true });
    mockCreatePublicToken.mockResolvedValue("test-public-token");
  });

  it("returns error for non-admin", async () => {
    mockAuth.mockResolvedValue({ has: () => false });
    const result = await getRunReconnectionData(1, "transcript");
    expect(result).toEqual({ ok: false, error: "Admin access required" });
  });

  it("returns error when episode not found", async () => {
    mockEpisodesFindFirst.mockResolvedValue(undefined);
    const result = await getRunReconnectionData(999, "transcript");
    expect(result).toEqual({ ok: false, error: "Episode not found" });
  });

  it("returns error when no in-flight transcript run ID", async () => {
    mockEpisodesFindFirst.mockResolvedValue({
      transcriptRunId: null,
      summaryRunId: null,
    });
    const result = await getRunReconnectionData(1, "transcript");
    expect(result).toEqual({ ok: false, error: "No in-flight run" });
  });

  it("returns error when no in-flight summary run ID", async () => {
    mockEpisodesFindFirst.mockResolvedValue({
      transcriptRunId: null,
      summaryRunId: null,
    });
    const result = await getRunReconnectionData(1, "summary");
    expect(result).toEqual({ ok: false, error: "No in-flight run" });
  });

  it("returns error for invalid episode ID", async () => {
    const result = await getRunReconnectionData(-1, "transcript");
    expect(result).toEqual({ ok: false, error: "Invalid episode ID" });
  });

  it("returns error for invalid run type", async () => {
    const result = await getRunReconnectionData(1, "invalid" as "transcript");
    expect(result).toEqual({ ok: false, error: "Invalid run type" });
  });

  it("returns runId and publicAccessToken for in-progress transcript run", async () => {
    mockEpisodesFindFirst.mockResolvedValue({
      transcriptRunId: "run_transcript_xyz",
      summaryRunId: null,
    });
    const result = await getRunReconnectionData(1, "transcript");
    expect(result).toEqual({
      ok: true,
      runId: "run_transcript_xyz",
      publicAccessToken: "test-public-token",
    });
    expect(mockCreatePublicToken).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: { read: { runs: ["run_transcript_xyz"] } },
        expirationTime: "30m",
      }),
    );
  });

  it("returns runId and publicAccessToken for in-progress summary run", async () => {
    mockEpisodesFindFirst.mockResolvedValue({
      transcriptRunId: null,
      summaryRunId: "run_summary_abc",
    });
    const result = await getRunReconnectionData(1, "summary");
    expect(result).toEqual({
      ok: true,
      runId: "run_summary_abc",
      publicAccessToken: "test-public-token",
    });
    expect(mockCreatePublicToken).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: { read: { runs: ["run_summary_abc"] } },
        expirationTime: "15m",
      }),
    );
  });

  it("returns error when token creation fails", async () => {
    mockEpisodesFindFirst.mockResolvedValue({
      transcriptRunId: "run_xyz",
      summaryRunId: null,
    });
    mockCreatePublicToken.mockRejectedValue(new Error("Token creation failed"));
    const result = await getRunReconnectionData(1, "transcript");
    expect(result).toEqual({
      ok: false,
      error: "Failed to get reconnection data",
    });
  });
});
