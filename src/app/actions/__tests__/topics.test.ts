import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Auth mock (hoisted to avoid TDZ issues) ---
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/auth-roles", () => ({ ADMIN_ROLE: "org:admin" }));

// --- Helpers mocks ---
const mockMergeCanonicals = vi.fn();
const mockUnmergeCanonicals = vi.fn();
vi.mock("@/trigger/helpers/database", () => ({
  mergeCanonicals: (...args: unknown[]) => mockMergeCanonicals(...args),
  unmergeCanonicals: (...args: unknown[]) => mockUnmergeCanonicals(...args),
}));

// --- Query mocks ---
const mockGetCanonicalTopicsListQuery = vi.fn();
const mockGetAdminAuditLogQuery = vi.fn();

// --- revalidatePath ---
const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

// --- DB mock (for removeAlias, triggerFullResummarize) ---
const mockDbDelete = vi.fn();
const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
vi.mock("@/db", () => ({
  db: {
    delete: (...args: unknown[]) => mockDbDelete(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

// --- tasks mock (for triggerFullResummarize) ---
const mockTasksTrigger = vi.fn();
vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: (...args: unknown[]) => mockTasksTrigger(...args) },
}));

// --- additional query mocks ---
const mockGetCanonicalMergeCleanupDriftQuery = vi.fn();
const mockGetUnmergeSuggestionsQuery = vi.fn();

vi.mock("@/lib/admin/topic-queries", () => ({
  getCanonicalTopicsListQuery: (...args: unknown[]) =>
    mockGetCanonicalTopicsListQuery(...args),
  getAdminAuditLogQuery: (...args: unknown[]) =>
    mockGetAdminAuditLogQuery(...args),
  getUnmergeSuggestionsQuery: (...args: unknown[]) =>
    mockGetUnmergeSuggestionsQuery(...args),
  getCanonicalMergeCleanupDriftQuery: (...args: unknown[]) =>
    mockGetCanonicalMergeCleanupDriftQuery(...args),
  getLinkedEpisodesForTopicQuery: vi.fn(),
}));

// -------------------------------------------------------------------

import {
  adminMergeCanonicals,
  adminUnmergeCanonicals,
  getCanonicalTopicsList,
  getAdminAuditLog,
  removeAlias,
  bulkMergeCanonicals,
  triggerFullResummarize,
  getCanonicalEpisodeCountDrift,
} from "@/app/actions/topics";

function makeAdminAuth(userId = "admin_1") {
  return { userId, has: vi.fn().mockReturnValue(true) };
}

function makeNonAdminAuth(userId = "user_1") {
  return { userId, has: vi.fn().mockReturnValue(false) };
}

function makeAnonAuth() {
  return { userId: null, has: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// adminMergeCanonicals
// ===========================================================================
describe("adminMergeCanonicals", () => {
  it("anonymous → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeAnonAuth());
    const result = await adminMergeCanonicals({ loserId: 1, winnerId: 2 });
    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(mockMergeCanonicals).not.toHaveBeenCalled();
  });

  it("signed-in non-admin → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeNonAdminAuth());
    const result = await adminMergeCanonicals({ loserId: 1, winnerId: 2 });
    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(mockMergeCanonicals).not.toHaveBeenCalled();
  });

  it("admin happy path → success + revalidate", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth("admin_42"));
    const mergeResult = {
      loserId: 1,
      winnerId: 2,
      episodesReassigned: 3,
      conflictsDropped: 1,
      aliasesCopied: 2,
    };
    mockMergeCanonicals.mockResolvedValue(mergeResult);

    const result = await adminMergeCanonicals({ loserId: 1, winnerId: 2 });

    expect(result).toEqual({ success: true, data: mergeResult });
    expect(mockMergeCanonicals).toHaveBeenCalledWith({
      loserId: 1,
      winnerId: 2,
      actor: "admin_42",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/topics");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/topics/1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/topics/2");
  });

  it("domain error from helper → ActionResult error (no rethrow)", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    mockMergeCanonicals.mockRejectedValue(new Error("not-active"));

    const result = await adminMergeCanonicals({ loserId: 1, winnerId: 2 });

    expect(result).toEqual({ success: false, error: "not-active" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("unexpected error from helper → rethrows", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    mockMergeCanonicals.mockRejectedValue(new Error("unexpected-db-failure"));

    await expect(
      adminMergeCanonicals({ loserId: 1, winnerId: 2 }),
    ).rejects.toThrow("unexpected-db-failure");
  });

  it("Zod: rejects non-integer loserId", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    const result = await adminMergeCanonicals({
      loserId: "not-a-number",
      winnerId: 2,
    } as unknown as {
      loserId: number;
      winnerId: number;
    });
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(mockMergeCanonicals).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// adminUnmergeCanonicals
// ===========================================================================
describe("adminUnmergeCanonicals", () => {
  it("anonymous → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeAnonAuth());
    const result = await adminUnmergeCanonicals({
      loserId: 5,
      episodeIdsToReassign: [1],
    });
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("signed-in non-admin → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeNonAdminAuth());
    const result = await adminUnmergeCanonicals({
      loserId: 5,
      episodeIdsToReassign: [1],
    });
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("admin happy path — alsoRemoveFromWinner defaults to true", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth("admin_7"));
    const unmergeResult = {
      loserId: 5,
      previousWinnerId: 9,
      episodesReassigned: 1,
      episodesSkipped: 0,
      episodesRemovedFromWinner: 1,
    };
    mockUnmergeCanonicals.mockResolvedValue(unmergeResult);

    const result = await adminUnmergeCanonicals({
      loserId: 5,
      episodeIdsToReassign: [77],
    });

    expect(result).toEqual({ success: true, data: unmergeResult });
    expect(mockUnmergeCanonicals).toHaveBeenCalledWith(
      expect.objectContaining({
        loserId: 5,
        episodeIdsToReassign: [77],
        alsoRemoveFromWinner: true,
        actor: "admin_7",
      }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/topics");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/topics/5");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/topics/9");
  });

  it("domain error from unmerge helper → ActionResult error", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    mockUnmergeCanonicals.mockRejectedValue(new Error("not-merged"));

    const result = await adminUnmergeCanonicals({
      loserId: 5,
      episodeIdsToReassign: [77],
    });

    expect(result).toEqual({ success: false, error: "not-merged" });
  });

  it("Zod: rejects missing episodeIdsToReassign", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    // @ts-expect-error intentional bad input
    const result = await adminUnmergeCanonicals({ loserId: 5 });
    expect(result).toEqual(expect.objectContaining({ success: false }));
  });
});

// ===========================================================================
// getCanonicalTopicsList
// ===========================================================================
describe("getCanonicalTopicsList", () => {
  it("anonymous → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeAnonAuth());
    const result = await getCanonicalTopicsList({ page: 1 });
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("non-admin → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeNonAdminAuth());
    const result = await getCanonicalTopicsList({ page: 1 });
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("admin happy path — returns rows + totalCount", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    const queryResult = { rows: [{ id: 1 }], totalCount: 1 };
    mockGetCanonicalTopicsListQuery.mockResolvedValue(queryResult);

    const result = await getCanonicalTopicsList({ page: 1, status: "active" });

    expect(result).toEqual({ success: true, data: queryResult });
    expect(mockGetCanonicalTopicsListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, status: "active" }),
    );
  });

  it("invalid range (episodeCountMin > episodeCountMax) → validation error", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    const result = await getCanonicalTopicsList({
      page: 1,
      episodeCountMin: 10,
      episodeCountMax: 5,
    });
    expect(result).toMatchObject({ success: false });
  });
});

// ===========================================================================
// getAdminAuditLog
// ===========================================================================
describe("getAdminAuditLog", () => {
  it("anonymous → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeAnonAuth());
    const result = await getAdminAuditLog({ page: 1 });
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("non-admin → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeNonAdminAuth());
    const result = await getAdminAuditLog({ page: 1 });
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("admin happy path — returns rows + totalCount", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    const queryResult = {
      rows: [{ id: 1, action: "merge", loserId: 2, winnerId: 3 }],
      totalCount: 1,
    };
    mockGetAdminAuditLogQuery.mockResolvedValue(queryResult);

    const result = await getAdminAuditLog({ page: 1, canonicalId: 2 });

    expect(result).toEqual({ success: true, data: queryResult });
    expect(mockGetAdminAuditLogQuery).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, canonicalId: 2 }),
    );
  });
});

// ===========================================================================
// removeAlias
// ===========================================================================

function makeDeleteChain(returnedRows: unknown[]) {
  const returningChain = {
    returning: vi.fn(() => Promise.resolve(returnedRows)),
  };
  return { where: vi.fn(() => returningChain) };
}

describe("removeAlias", () => {
  it("anonymous → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeAnonAuth());
    const result = await removeAlias({ canonicalId: 1, aliasId: 2 });
    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("non-admin → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeNonAdminAuth());
    const result = await removeAlias({ canonicalId: 1, aliasId: 2 });
    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("admin happy path — deletes, revalidates, returns { removed: 1 }", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    mockDbDelete.mockReturnValue(makeDeleteChain([{ id: 2 }]));

    const result = await removeAlias({ canonicalId: 10, aliasId: 2 });

    expect(result).toEqual({ success: true, data: { removed: 1 } });
    expect(mockDbDelete).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/topics/10");
  });

  it("admin with mismatched FK pair — delete finds no rows, returns { success: false, error: 'not-found' }", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    mockDbDelete.mockReturnValue(makeDeleteChain([]));

    const result = await removeAlias({ canonicalId: 10, aliasId: 999 });

    expect(result).toEqual({ success: false, error: "not-found" });
    // No revalidate when nothing actually changed.
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// bulkMergeCanonicals
// ===========================================================================
describe("bulkMergeCanonicals", () => {
  it("anonymous → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeAnonAuth());
    const result = await bulkMergeCanonicals({ loserIds: [1], winnerId: 2 });
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("non-admin → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeNonAdminAuth());
    const result = await bulkMergeCanonicals({ loserIds: [1], winnerId: 2 });
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("Zod: rejects empty loserIds", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    const result = await bulkMergeCanonicals({ loserIds: [], winnerId: 2 });
    expect(result).toMatchObject({ success: false });
    expect(mockMergeCanonicals).not.toHaveBeenCalled();
  });

  it("Zod: rejects when winnerId is in loserIds", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    const result = await bulkMergeCanonicals({ loserIds: [2, 3], winnerId: 2 });
    expect(result).toMatchObject({ success: false });
    expect(mockMergeCanonicals).not.toHaveBeenCalled();
  });

  it("Zod: rejects duplicate loserIds (dedup-or-fail → fail)", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    const result = await bulkMergeCanonicals({
      loserIds: [1, 1, 2],
      winnerId: 5,
    });
    expect(result).toMatchObject({ success: false });
    expect(mockMergeCanonicals).not.toHaveBeenCalled();
  });

  it("admin happy path — all losers merge cleanly", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth("admin_1"));
    const mergeResult = {
      loserId: 1,
      winnerId: 5,
      episodesReassigned: 2,
      conflictsDropped: 0,
      aliasesCopied: 1,
    };
    mockMergeCanonicals.mockResolvedValue(mergeResult);

    const result = await bulkMergeCanonicals({ loserIds: [1, 2], winnerId: 5 });

    expect(result).toMatchObject({
      success: true,
      data: { succeeded: 2, failed: 0 },
    });
    expect(mockMergeCanonicals).toHaveBeenCalledTimes(2);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/topics");
  });

  it("per-loser failure isolation — one throws, others still processed", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth("admin_1"));
    mockMergeCanonicals
      .mockResolvedValueOnce({ loserId: 1, winnerId: 5 })
      .mockRejectedValueOnce(new Error("not-active"))
      .mockResolvedValueOnce({ loserId: 3, winnerId: 5 });

    const result = await bulkMergeCanonicals({
      loserIds: [1, 2, 3],
      winnerId: 5,
    });

    expect(result).toMatchObject({
      success: true,
      data: { succeeded: 2, failed: 1 },
    });
    const data = (result as { success: true; data: { results: unknown[] } })
      .data;
    const failedEntry = data.results.find(
      (r: unknown) => (r as { loserId: number }).loserId === 2,
    );
    expect(failedEntry).toMatchObject({ ok: false, error: "not-active" });
  });
});

// ===========================================================================
// triggerFullResummarize
// ===========================================================================

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "limit"];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

function makeUpdateChain(returnedRows: unknown[] = [{ id: 1 }]) {
  const whereResult = {
    returning: vi.fn(() => Promise.resolve(returnedRows)),
  };
  return {
    set: vi.fn(() => ({
      where: vi.fn(() => whereResult),
    })),
  };
}

describe("triggerFullResummarize", () => {
  it("anonymous → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeAnonAuth());
    const result = await triggerFullResummarize({ episodeId: 1 });
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("non-admin → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeNonAdminAuth());
    const result = await triggerFullResummarize({ episodeId: 1 });
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("episode not found → { success: false, error: 'not-found' }", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    mockDbSelect.mockReturnValue(makeSelectChain([]));

    const result = await triggerFullResummarize({ episodeId: 999 });

    expect(result).toEqual({ success: false, error: "not-found" });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  it("transcript not available → { success: false, error: 'no-transcript' }", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    mockDbSelect.mockReturnValue(
      makeSelectChain([
        {
          id: 1,
          podcastIndexId: "pid_1",
          transcriptStatus: "missing",
          summaryStatus: null,
        },
      ]),
    );

    const result = await triggerFullResummarize({ episodeId: 1 });

    expect(result).toEqual({ success: false, error: "no-transcript" });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  it("summary already busy → { success: false, error: 'already-busy' }", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    for (const busyStatus of ["queued", "running", "summarizing"]) {
      mockDbSelect.mockReturnValue(
        makeSelectChain([
          {
            id: 1,
            podcastIndexId: "42",
            transcriptStatus: "available",
            summaryStatus: busyStatus,
          },
        ]),
      );
      const result = await triggerFullResummarize({ episodeId: 1 });
      expect(result).toEqual({ success: false, error: "already-busy" });
      expect(mockTasksTrigger).not.toHaveBeenCalled();
    }
  });

  it("admin happy path — sets queued, triggers task, returns runId", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    mockDbSelect.mockReturnValue(
      makeSelectChain([
        {
          id: 1,
          podcastIndexId: "42",
          transcriptStatus: "available",
          summaryStatus: null,
        },
      ]),
    );
    mockDbUpdate.mockReturnValue(makeUpdateChain());
    mockTasksTrigger.mockResolvedValue({ id: "run_abc" });

    const result = await triggerFullResummarize({ episodeId: 1 });

    expect(result).toMatchObject({
      success: true,
      data: { runId: "run_abc", episodeId: 1 },
    });
    expect(mockTasksTrigger).toHaveBeenCalledWith(
      "summarize-episode",
      expect.objectContaining({ episodeId: 42 }),
    );
  });

  it("trigger throw reverts summaryStatus", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    mockDbSelect.mockReturnValue(
      makeSelectChain([
        {
          id: 1,
          podcastIndexId: "42",
          transcriptStatus: "available",
          summaryStatus: "completed",
        },
      ]),
    );
    const updateChain = makeUpdateChain();
    mockDbUpdate.mockReturnValue(updateChain);
    mockTasksTrigger.mockRejectedValue(new Error("trigger-failure"));

    const result = await triggerFullResummarize({ episodeId: 1 });

    expect(result).toMatchObject({ success: false });
    // update called twice: once to set queued, once to revert
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// getCanonicalEpisodeCountDrift
// ===========================================================================
describe("getCanonicalEpisodeCountDrift", () => {
  it("anonymous → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeAnonAuth());
    const result = await getCanonicalEpisodeCountDrift();
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("non-admin → Forbidden", async () => {
    mockAuth.mockResolvedValue(makeNonAdminAuth());
    const result = await getCanonicalEpisodeCountDrift();
    expect(result).toEqual({ success: false, error: "Forbidden" });
  });

  it("admin happy path — returns drift rows", async () => {
    mockAuth.mockResolvedValue(makeAdminAuth());
    const driftRows = [
      {
        id: 1,
        label: "Topic A",
        status: "merged",
        mergedIntoId: 99,
        junctionRowCount: 3,
      },
    ];
    mockGetCanonicalMergeCleanupDriftQuery.mockResolvedValue(driftRows);

    const result = await getCanonicalEpisodeCountDrift();

    expect(result).toEqual({ success: true, data: driftRows });
    expect(mockGetCanonicalMergeCleanupDriftQuery).toHaveBeenCalled();
  });
});
