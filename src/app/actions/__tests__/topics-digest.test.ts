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
}));

// ─── Threshold constants mock ─────────────────────────────────────────────────

vi.mock("@/lib/topic-digest-thresholds", () => ({
  MIN_DERIVED_COUNT_FOR_DIGEST: 3,
  STALENESS_GROWTH_THRESHOLD: 3,
}));

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

// ─── Import action under test ─────────────────────────────────────────────────

import { triggerTopicDigestGeneration } from "@/app/actions/topics";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function makeAuth(userId = "user_1") {
  return { userId, has: vi.fn().mockReturnValue(false) };
}
function makeAnonAuth() {
  return { userId: null, has: vi.fn() };
}

// ─── DB query helpers ─────────────────────────────────────────────────────────

/**
 * Sets up the DB select chain for a sequence of resolved results.
 * Each mockDbSelect call gets the next result in order.
 */
function setupDbSelectSequence(results: unknown[]) {
  let callIndex = 0;
  mockDbSelect.mockImplementation(() => {
    const result = results[callIndex++] ?? [];
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    };
  });
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

  // ── Case 3: Canonical not found ──────────────────────────────────────────────

  it("case 3 — canonical not found: returns not-found error", async () => {
    setupDbSelectSequence([[]]);
    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 99 });
    expect(result).toEqual({ success: false, error: "not-found" });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  // ── Case 4: Canonical non-active (status !== active) ─────────────────────────

  it("case 4 — canonical non-active (merged): returns not-found (don't expose internal status)", async () => {
    setupDbSelectSequence([
      [
        {
          id: 5,
          label: "Topic",
          summary: "S",
          status: "merged",
          episodeCount: 10,
        },
      ],
    ]);
    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 5 });
    expect(result).toEqual({ success: false, error: "not-found" });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  // ── Case 5: Ineligible (episode count < 3) ───────────────────────────────────

  it("case 5 — ineligible (count < 3): returns ineligible status; tasks.trigger NOT called", async () => {
    setupDbSelectSequence([
      [
        {
          id: 5,
          label: "Topic",
          summary: "S",
          status: "active",
          episodeCount: 2,
        },
      ],
      [], // no existing digest
    ]);
    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 5 });
    expect(result).toEqual({
      success: true,
      data: { status: "ineligible", digestId: undefined },
    });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  // ── Case 6: Cached (existing fresh, growth < 3) ──────────────────────────────

  it("case 6 — cached (growth < 3): returns cached status; tasks.trigger NOT called", async () => {
    setupDbSelectSequence([
      [
        {
          id: 5,
          label: "Topic",
          summary: "S",
          status: "active",
          episodeCount: 7,
        },
      ],
      [{ id: 22, episodeCountAtGeneration: 5 }], // growth = 2 < 3
    ]);
    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 5 });
    expect(result).toEqual({
      success: true,
      data: { status: "cached", digestId: 22 },
    });
    expect(mockTasksTrigger).not.toHaveBeenCalled();
  });

  // ── Case 7: Queued first-time (no existing digest) ───────────────────────────

  it("case 7 — queued first-time: tasks.trigger called; returns queued + runId", async () => {
    setupDbSelectSequence([
      [
        {
          id: 5,
          label: "Topic",
          summary: "S",
          status: "active",
          episodeCount: 4,
        },
      ],
      [], // no existing digest
    ]);
    mockTasksTrigger.mockResolvedValue({ id: "run_abc123" });

    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 5 });

    expect(result).toEqual({
      success: true,
      data: { status: "queued", digestId: undefined, runId: "run_abc123" },
    });
    expect(mockTasksTrigger).toHaveBeenCalledWith("generate-topic-digest", {
      canonicalTopicId: 5,
    });
  });

  // ── Case 8: Queued stale (growth >= 3) ──────────────────────────────────────

  it("case 8 — queued stale (growth >= 3): tasks.trigger called with canonical id", async () => {
    setupDbSelectSequence([
      [
        {
          id: 5,
          label: "Topic",
          summary: "S",
          status: "active",
          episodeCount: 6,
        },
      ],
      [{ id: 22, episodeCountAtGeneration: 3 }], // growth = 3 >= 3 → stale
    ]);
    mockTasksTrigger.mockResolvedValue({ id: "run_xyz" });

    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 5 });

    expect(result).toEqual({
      success: true,
      data: { status: "queued", digestId: 22, runId: "run_xyz" },
    });
    expect(mockTasksTrigger).toHaveBeenCalledWith("generate-topic-digest", {
      canonicalTopicId: 5,
    });
  });

  // ── Case 9: tasks.trigger outage ─────────────────────────────────────────────

  it("case 9 — tasks.trigger outage: returns trigger-failed error; no DB writes", async () => {
    setupDbSelectSequence([
      [
        {
          id: 5,
          label: "Topic",
          summary: "S",
          status: "active",
          episodeCount: 4,
        },
      ],
      [],
    ]);
    mockTasksTrigger.mockRejectedValue(new Error("Trigger.dev unavailable"));

    const result = await triggerTopicDigestGeneration({ canonicalTopicId: 5 });

    expect(result).toEqual({ success: false, error: "trigger-failed" });
    expect(mockTasksTrigger).toHaveBeenCalledOnce();
  });
});
