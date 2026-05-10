import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Auth mock (hoisted to avoid TDZ) ────────────────────────────────────────

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/auth-roles", () => ({ ADMIN_ROLE: "org:admin" }));

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockDbSelect = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

// ─── Schema mock ──────────────────────────────────────────────────────────────

vi.mock("@/db/schema", () => ({
  canonicalTopics: {
    id: "ct.id",
    label: "ct.label",
    kind: "ct.kind",
    status: "ct.status",
  },
  canonicalTopicDigests: {
    id: "ctd.id",
    canonicalTopicId: "ctd.canonicalTopicId",
    generatedAt: "ctd.generatedAt",
    consensusPoints: "ctd.consensusPoints",
    episodeCountAtGeneration: "ctd.episodeCountAtGeneration",
  },
  canonicalTopicStatusEnum: { enumValues: ["active", "merged", "dormant"] },
  canonicalTopicKindEnum: {
    enumValues: [
      "release",
      "incident",
      "regulation",
      "announcement",
      "deal",
      "event",
      "concept",
      "work",
      "other",
    ],
  },
  canonicalTopicAliases: {},
  episodes: {},
  episodeCanonicalTopics: {},
  IN_PROGRESS_STATUSES: [],
}));

// ─── Drizzle-ORM stubs ────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ type: "eq", col, val })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", conditions: args })),
  gte: vi.fn((col: unknown, val: unknown) => ({ type: "gte", col, val })),
  desc: vi.fn((col: unknown) => ({ type: "desc", col })),
  isNull: vi.fn((col: unknown) => ({ type: "isNull", col })),
  isNotNull: vi.fn((col: unknown) => ({ type: "isNotNull", col })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({
    type: "inArray",
    col,
    vals,
  })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: "sql",
      strings,
      values,
    }),
    {
      raw: (s: string) => ({ type: "sql.raw", value: s }),
    },
  ),
}));

// ─── Trigger mock ─────────────────────────────────────────────────────────────

const mockTasksTrigger = vi.fn();
vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: (...args: unknown[]) => mockTasksTrigger(...args) },
  auth: { createPublicToken: vi.fn() },
}));

// ─── Episode count mock ───────────────────────────────────────────────────────

vi.mock("@/lib/admin/canonical-topic-episode-count", () => ({
  canonicalTopicEpisodeCount: vi.fn(() => ({
    type: "sql",
    template: ["(SELECT count(*)...)"],
    values: [],
  })),
  canonicalTopicCompletedSummaryCount: vi.fn(() => ({
    type: "sql",
    template: ["(SELECT count(*) ... summary_status='completed' ...)"],
    values: [],
  })),
}));

// Note: `@/lib/topic-digest-thresholds` is intentionally NOT mocked — tests
// import the real constants and compute boundary values from them.

// ─── No-op mocks for topics.ts imports not under test ────────────────────────

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/trigger/helpers/database", () => ({
  mergeCanonicals: vi.fn(),
  unmergeCanonicals: vi.fn(),
}));
vi.mock("@/lib/admin/topic-queries", () => ({
  getCanonicalTopicsListQuery: vi.fn(),
  getAdminAuditLogQuery: vi.fn(),
  getUnmergeSuggestionsQuery: vi.fn(),
  getCanonicalMergeCleanupDriftQuery: vi.fn(),
  getLinkedEpisodesForTopicQuery: vi.fn(),
}));
vi.mock("@/trigger/generate-topic-digest", () => ({
  generateTopicDigest: {},
}));
vi.mock("@/trigger/summarize-episode", () => ({ summarizeEpisode: {} }));
vi.mock("@/lib/entity-resolution", () => ({ formatVector: vi.fn() }));
vi.mock("@/trigger/helpers/coerce-embedding", () => ({
  coerceEmbedding: vi.fn(),
}));

// ─── Import action under test ─────────────────────────────────────────────────

import { getRecentTopicDigests } from "@/app/actions/topics";
import { MAX_CONSENSUS_PREVIEW_CHARS } from "@/lib/topic-digest-preview";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function makeAuth(userId = "user_1") {
  return { userId, has: vi.fn().mockReturnValue(false) };
}
function makeAnonAuth() {
  return { userId: null, has: vi.fn() };
}

// ─── Fixture factory ──────────────────────────────────────────────────────────

function makeDigestRow(
  overrides: Partial<{
    canonicalId: number;
    label: string;
    kind: string;
    generatedAt: Date;
    consensusPoints: string[];
  }> = {},
) {
  return {
    canonicalId: overrides.canonicalId ?? 1,
    label: overrides.label ?? "AI Regulation",
    kind: overrides.kind ?? "regulation",
    generatedAt: overrides.generatedAt ?? new Date("2026-05-08T10:00:00Z"),
    consensusPoints: overrides.consensusPoints ?? [
      "AI regulation is coming soon.",
    ],
  };
}

// Two-pass mock: pass 1 = innerJoin chain (digest rows),
// pass 2 = where chain (episode-count rows). Returns a tracker with
// the spy on each chain step so tests can assert call shape.
function setupTwoPassMock(
  digestRows: ReturnType<typeof makeDigestRow>[],
  countRows: { id: number; episodeCount: number }[] = [],
) {
  const innerJoinSpy = vi.fn();
  const whereSpy1 = vi.fn();
  const orderBySpy = vi.fn();
  const limitSpy = vi.fn().mockResolvedValue(digestRows);
  const whereSpy2 = vi.fn().mockResolvedValue(countRows);

  let callIdx = 0;
  mockDbSelect.mockImplementation(() => {
    callIdx += 1;
    if (callIdx === 1) {
      // Pass 1: select → from → innerJoin → where → orderBy → limit
      return {
        from: vi.fn().mockReturnValue({
          innerJoin: innerJoinSpy.mockReturnValue({
            where: whereSpy1.mockReturnValue({
              orderBy: orderBySpy.mockReturnValue({
                limit: limitSpy,
              }),
            }),
          }),
        }),
      };
    }
    // Pass 2: select → from → where (awaited directly)
    return {
      from: vi.fn().mockReturnValue({
        where: whereSpy2,
      }),
    };
  });

  return { innerJoinSpy, whereSpy1, orderBySpy, limitSpy, whereSpy2 };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(makeAuth());
});

describe("getRecentTopicDigests", () => {
  // ── Case 1: Unauthenticated ──────────────────────────────────────────────────

  it("case 1 — unauthenticated: returns Unauthorized", async () => {
    mockAuth.mockResolvedValue(makeAnonAuth());
    const result = await getRecentTopicDigests();
    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  // ── Case 2: Populated — returns expected shape ────────────────────────────────

  it("case 2 — populated: returns ordered list with correct shape", async () => {
    const generatedAt = new Date("2026-05-08T10:00:00Z");
    const fixtureRows = [
      makeDigestRow({
        canonicalId: 10,
        label: "GDPR Update",
        kind: "regulation",
        generatedAt,
        consensusPoints: ["New privacy rules."],
      }),
    ];
    setupTwoPassMock(fixtureRows, [{ id: 10, episodeCount: 8 }]);

    const result = await getRecentTopicDigests({ limit: 5 });
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error("Expected success");
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      canonicalId: 10,
      label: "GDPR Update",
      kind: "regulation",
      episodeCount: 8,
      generatedAt,
      consensusPreview: "New privacy rules.",
    });
  });

  // ── Case 3a: consensusPreview truncation — long string ────────────────────────

  it("case 3a — long consensusPoints[0]: truncated with ellipsis, total length = MAX+1", async () => {
    const longPoint = "A".repeat(MAX_CONSENSUS_PREVIEW_CHARS + 50);
    const fixtureRows = [makeDigestRow({ consensusPoints: [longPoint] })];
    setupTwoPassMock(fixtureRows, [{ id: 1, episodeCount: 5 }]);

    const result = await getRecentTopicDigests();
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error("Expected success");
    const preview = result.data[0]!.consensusPreview;
    expect(preview.length).toBe(MAX_CONSENSUS_PREVIEW_CHARS + 1); // +1 for the "…" char
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.startsWith("A".repeat(MAX_CONSENSUS_PREVIEW_CHARS))).toBe(
      true,
    );
  });

  // ── Case 3b: consensusPreview — short string unchanged ───────────────────────

  it("case 3b — short consensusPoints[0]: returned unchanged", async () => {
    const shortPoint = "A".repeat(MAX_CONSENSUS_PREVIEW_CHARS);
    const fixtureRows = [makeDigestRow({ consensusPoints: [shortPoint] })];
    setupTwoPassMock(fixtureRows, [{ id: 1, episodeCount: 5 }]);

    const result = await getRecentTopicDigests();
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error("Expected success");
    expect(result.data[0]!.consensusPreview).toBe(shortPoint);
  });

  // ── Case 3c: consensusPreview — empty array → empty string ───────────────────

  it("case 3c — empty consensusPoints array: consensusPreview is empty string", async () => {
    const fixtureRows = [makeDigestRow({ consensusPoints: [] })];
    setupTwoPassMock(fixtureRows, [{ id: 1, episodeCount: 5 }]);

    const result = await getRecentTopicDigests();
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error("Expected success");
    expect(result.data[0]!.consensusPreview).toBe("");
  });

  // ── Case 4: limit clamping — over-max returns Zod error ─────────────────────

  it("case 4 — limit > 20: returns Zod validation error", async () => {
    const result = await getRecentTopicDigests({ limit: 21 });
    expect(result).toMatchObject({ success: false });
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  // ── Case 5: DB chain assertion ────────────────────────────────────────────────

  it("case 5 — DB chain: pass-1 innerJoin called once with where/orderBy/limit, pass-2 where called when rows present", async () => {
    const fixtureRows = [makeDigestRow({ canonicalId: 99 })];
    const spies = setupTwoPassMock(fixtureRows, [{ id: 99, episodeCount: 5 }]);

    await getRecentTopicDigests({ limit: 3 });

    // Two select() calls: pass-1 (digest rows) + pass-2 (count rows).
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
    expect(spies.innerJoinSpy).toHaveBeenCalledOnce();
    expect(spies.whereSpy1).toHaveBeenCalledOnce();
    expect(spies.orderBySpy).toHaveBeenCalledOnce();
    expect(spies.limitSpy).toHaveBeenCalledWith(3);
    expect(spies.whereSpy2).toHaveBeenCalledOnce();
  });

  it("case 5b — DB chain: pass-2 skipped when pass-1 returns empty (no extra select)", async () => {
    setupTwoPassMock([], []);
    await getRecentTopicDigests({ limit: 5 });
    // Only pass-1 ran; pass-2 short-circuited.
    expect(mockDbSelect).toHaveBeenCalledOnce();
  });

  // ── Case 6: episodeCount coerced to number ────────────────────────────────────

  it("case 6 — episodeCount: coerced to number even when raw value is string-like", async () => {
    const fixtureRows = [makeDigestRow({ canonicalId: 1 })];
    setupTwoPassMock(fixtureRows, [
      { id: 1, episodeCount: "7" as unknown as number },
    ]);

    const result = await getRecentTopicDigests();
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error("Expected success");
    expect(typeof result.data[0]!.episodeCount).toBe("number");
    expect(result.data[0]!.episodeCount).toBe(7);
  });
});
