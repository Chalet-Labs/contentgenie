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
vi.mock("@/lib/admin/topic-queries", () => ({
  getCanonicalTopicsListQuery: (...args: unknown[]) =>
    mockGetCanonicalTopicsListQuery(...args),
  getAdminAuditLogQuery: (...args: unknown[]) =>
    mockGetAdminAuditLogQuery(...args),
}));

// --- revalidatePath ---
const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

// -------------------------------------------------------------------

import {
  adminMergeCanonicals,
  adminUnmergeCanonicals,
  getCanonicalTopicsList,
  getAdminAuditLog,
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
      newWinnerEpisodeCount: 7,
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
