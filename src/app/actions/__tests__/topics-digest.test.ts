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
    summary: "ct.summary",
    status: "ct.status",
  },
  canonicalTopicDigests: {
    id: "ctd.id",
    canonicalTopicId: "ctd.canonicalTopicId",
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
  IN_PROGRESS_STATUSES: [],
}));

// ─── Drizzle-ORM stubs ────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ type: "eq", col, val })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", conditions: args })),
  isNull: vi.fn((col: unknown) => ({ type: "isNull", col })),
}));

// ─── Trigger mock ─────────────────────────────────────────────────────────────

const mockTasksTrigger = vi.fn();
vi.mock("@trigger.dev/sdk", () => ({
  tasks: { trigger: (...args: unknown[]) => mockTasksTrigger(...args) },
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

// ─── Import action under test (real thresholds module) ──────────────────────

import { triggerTopicDigestGeneration } from "@/app/actions/topics";
import {
  MIN_DERIVED_COUNT_FOR_DIGEST,
  STALENESS_GROWTH_THRESHOLD,
} from "@/lib/topic-digest-thresholds";
import { setupDbSelectSequence } from "@/test/db-select-sequence";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function makeAuth(userId = "user_1") {
  return { userId, has: vi.fn().mockReturnValue(false) };
}
function makeAnonAuth() {
  return { userId: null, has: vi.fn() };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(makeAuth());
});

describe("triggerTopicDigestGeneration", () => {
  // ── Case 1: Unauthenticated ─────────────────────────────────────────────────

  it("case 1 — unauthenticated: returns Unauthorized", async () => {
    mockAuth.mockResolvedValue(makeAnonAuth());
    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 1 });
    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  // ── Case 2: Invalid input (Zod rejection) ────────────────────────────────────

  it("case 2 — invalid input (negative id): Zod failure surfaced as error", async () => {
    const result = await triggerTopicDigestGeneration({
      canonicalTopicId: -1,
    });
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  // ── Case 2b: Unknown extra key (.strict) ────────────────────────────────────

  it("case 2b — unknown extra key: .strict rejects", async () => {
    const result = await triggerTopicDigestGeneration({
      canonicalTopicId: 5,
      // @ts-expect-error — verifying runtime .strict() rejection
      extra: 1,
    });
    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(typeof (result as { error: string }).error).toBe("string");
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  // ── Case 3: Canonical not found ──────────────────────────────────────────────

  it("case 3 — canonical not found: returns not-found error", async () => {
    setupDbSelectSequence(mockDbSelect, [[], []]);
    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 99 });
    expect(result).toEqual({ success: false, error: "not-found" });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  // ── Case 4: Canonical non-active (status !== active) ─────────────────────────

  it("case 4 — canonical non-active (merged): returns not-found (don't expose internal status)", async () => {
    setupDbSelectSequence(mockDbSelect, [
      [
        {
          id: 5,
          label: "Topic",
          summary: "S",
          status: "merged",
          completedSummaryCount: 10,
        },
      ],
      [],
    ]);
    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 5 });
    expect(result).toEqual({ success: false, error: "not-found" });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  // ── Case 5: Ineligible (episode count < MIN_DERIVED_COUNT_FOR_DIGEST) ───────

  it("case 5 — ineligible (count below MIN_DERIVED_COUNT_FOR_DIGEST): returns ineligible status; tasks.trigger NOT called", async () => {
    setupDbSelectSequence(mockDbSelect, [
      [
        {
          id: 5,
          label: "Topic",
          summary: "S",
          status: "active",
          completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST - 1,
        },
      ],
      [],
    ]);
    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 5 });
    expect(result).toEqual({
      success: true,
      data: { status: "ineligible", digestId: undefined },
    });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  // ── Case 6: Cached (existing fresh, growth < STALENESS_GROWTH_THRESHOLD) ────

  it("case 6 — cached (growth below STALENESS_GROWTH_THRESHOLD): returns cached status; tasks.trigger NOT called", async () => {
    const baseCount = MIN_DERIVED_COUNT_FOR_DIGEST + 2;
    setupDbSelectSequence(mockDbSelect, [
      [
        {
          id: 5,
          label: "Topic",
          summary: "S",
          status: "active",
          completedSummaryCount: baseCount + (STALENESS_GROWTH_THRESHOLD - 1),
        },
      ],
      [{ id: 22, episodeCountAtGeneration: baseCount }],
    ]);
    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 5 });
    expect(result).toEqual({
      success: true,
      data: { status: "cached", digestId: 22 },
    });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  // ── Case 7: Queued first-time (no existing digest) ───────────────────────────

  it("case 7 — queued first-time: tasks.trigger called with idempotencyKey; returns queued + runId", async () => {
    setupDbSelectSequence(mockDbSelect, [
      [
        {
          id: 5,
          label: "Topic",
          summary: "S",
          status: "active",
          completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST + 1,
        },
      ],
      [],
    ]);
    mockTasksTrigger.mockResolvedValue({ id: "run_abc123" });

    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 5 });

    expect(result).toEqual({
      success: true,
      data: { status: "queued", digestId: undefined, runId: "run_abc123" },
    });
    expect(mockTasksTrigger).toHaveBeenCalledWith(
      "generate-topic-digest",
      { canonicalTopicId: 5 },
      expect.objectContaining({
        idempotencyKey: "generate-topic-digest-5",
        idempotencyKeyTTL: "10m",
      }),
    );
  });

  // ── Case 8: Queued stale (growth >= STALENESS_GROWTH_THRESHOLD) ─────────────

  it("case 8 — queued stale (growth at or above STALENESS_GROWTH_THRESHOLD): tasks.trigger called with canonical id", async () => {
    const baseCount = MIN_DERIVED_COUNT_FOR_DIGEST;
    setupDbSelectSequence(mockDbSelect, [
      [
        {
          id: 5,
          label: "Topic",
          summary: "S",
          status: "active",
          completedSummaryCount: baseCount + STALENESS_GROWTH_THRESHOLD,
        },
      ],
      [{ id: 22, episodeCountAtGeneration: baseCount }],
    ]);
    mockTasksTrigger.mockResolvedValue({ id: "run_xyz" });

    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 5 });

    expect(result).toEqual({
      success: true,
      data: { status: "queued", digestId: 22, runId: "run_xyz" },
    });
    expect(mockTasksTrigger).toHaveBeenCalledWith(
      "generate-topic-digest",
      { canonicalTopicId: 5 },
      expect.objectContaining({
        idempotencyKey: "generate-topic-digest-5",
      }),
    );
  });

  // ── Case 9: tasks.trigger outage ─────────────────────────────────────────────

  it("case 9 — tasks.trigger outage: returns trigger error message; no DB writes", async () => {
    setupDbSelectSequence(mockDbSelect, [
      [
        {
          id: 5,
          label: "Topic",
          summary: "S",
          status: "active",
          completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST + 1,
        },
      ],
      [],
    ]);
    mockTasksTrigger.mockRejectedValue(new Error("Trigger.dev unavailable"));

    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 5 });

    // Action now surfaces the underlying error message instead of swallowing it.
    expect(result).toEqual({
      success: false,
      error: "Trigger.dev unavailable",
    });
    expect(mockTasksTrigger).toHaveBeenCalledOnce();
  });
});
