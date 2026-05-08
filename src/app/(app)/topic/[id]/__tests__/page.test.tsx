import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// next/navigation's notFound() and permanentRedirect() throw internally —
// replicate that here so control flow halts.
const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const mockPermanentRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
  permanentRedirect: (url: string) => mockPermanentRedirect(url),
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Each `mockNextTopicRow.mockResolvedValueOnce(row)` feeds the next call's
// `.limit()` result. `null`/`undefined` resolve to `[]` to model "not found".
const mockNextTopicRow = vi.fn();

function buildSelectChain() {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => {
      const row = await mockNextTopicRow();
      return row == null ? [] : [row];
    },
  };
  return chain;
}

vi.mock("@/db", () => ({
  db: {
    select: () => buildSelectChain(),
  },
}));

vi.mock("@/db/schema", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/schema")>();
  return { ...actual };
});

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  };
});

// Mock the new server actions. Each test reseeds with `mockResolvedValueOnce`.
const mockGetTopicDetailData = vi.fn();
const mockTriggerTopicDigestRefresh = vi.fn();

vi.mock("@/app/actions/topics", () => ({
  getTopicDetailData: (...args: unknown[]) => mockGetTopicDetailData(...args),
  triggerTopicDigestRefresh: (...args: unknown[]) =>
    mockTriggerTopicDigestRefresh(...args),
}));

// Stub the realtime hook so the digest panel doesn't try to connect.
vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: vi.fn(() => ({ run: null })),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// nuqs needs an Adapter context — stub the hook directly.
vi.mock("nuqs", () => ({
  useQueryState: vi.fn(() => [false, vi.fn()]),
  parseAsBoolean: {
    withDefault: (defaultValue: boolean) => ({
      __brand: "parseAsBoolean",
      defaultValue,
    }),
  },
}));

// Stub the server-side search params loader.
vi.mock("@/lib/search-params/topic-detail", () => ({
  loadTopicDetailSearchParams: (
    searchParams: Record<string, string | string[] | undefined>,
  ) => ({ unheard: searchParams.unheard === "true" }),
  topicDetailSearchParams: {
    unheard: {
      withDefault: () => ({ __brand: "parseAsBoolean", defaultValue: false }),
      withOptions: () => ({ __brand: "parseAsBoolean", defaultValue: false }),
    },
  },
}));

// Stub next/headers — page calls headers() to check prefetch header.
vi.mock("next/headers", () => ({
  headers: vi.fn(() => ({ get: (_: string) => null })),
}));

import TopicPage from "@/app/(app)/topic/[id]/page";
import { MAX_MERGE_DEPTH } from "@/app/(app)/topic/[id]/merge-walker";
import { MIN_DERIVED_COUNT_FOR_DIGEST } from "@/lib/topic-digest-thresholds";

type ActiveTopic = {
  id: number;
  label: string;
  kind: string;
  status: "active";
  summary: string;
  episodeCount: number;
  mergedIntoId: null;
};

type MergedTopic = {
  id: number;
  label: string;
  kind: string;
  status: "merged";
  summary: string;
  episodeCount: number;
  mergedIntoId: number;
};

type DormantTopic = {
  id: number;
  label: string;
  kind: string;
  status: "dormant";
  summary: string;
  episodeCount: number;
  mergedIntoId: null;
};

type CanonicalTopicRow = ActiveTopic | MergedTopic | DormantTopic;

function makeTopic(
  overrides: Partial<CanonicalTopicRow> = {},
): CanonicalTopicRow {
  return {
    id: 1,
    label: "Claude Opus 4.7 release",
    kind: "release",
    status: "active",
    summary: "Anthropic released Claude Opus 4.7 with extended thinking.",
    episodeCount: 12,
    mergedIntoId: null,
    ...overrides,
  } as CanonicalTopicRow;
}

function makeDetailData(
  overrides: {
    digest?: unknown;
    completedSummaryCount?: number;
    relatedTopics?: unknown[];
    episodes?: unknown[];
    canonical?: Record<string, unknown>;
  } = {},
) {
  return {
    canonical: {
      id: 1,
      label: "Claude Opus 4.7 release",
      kind: "release",
      status: "active",
      summary: "Anthropic released Claude Opus 4.7 with extended thinking.",
      episodeCount: 12,
      completedSummaryCount: overrides.completedSummaryCount ?? 5,
      ...overrides.canonical,
    },
    digest: overrides.digest ?? null,
    episodes: overrides.episodes ?? [],
    relatedTopics: overrides.relatedTopics ?? [],
  };
}

describe("TopicPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetTopicDetailData.mockResolvedValue({
      success: true,
      data: makeDetailData(),
    });
    mockTriggerTopicDigestRefresh.mockResolvedValue({
      success: true,
      data: { status: "ineligible" },
    });
  });

  it.each(["abc", "-1", "0", "01", "1e2", "2147483648"])(
    "calls notFound() for invalid id %s",
    async (id) => {
      await expect(
        TopicPage({ params: { id }, searchParams: {} }),
      ).rejects.toThrow("NEXT_NOT_FOUND");
      expect(mockNotFound).toHaveBeenCalledOnce();
    },
  );

  it("calls notFound() when DB returns null", async () => {
    mockNextTopicRow.mockResolvedValue(null);
    await expect(
      TopicPage({ params: { id: "1" }, searchParams: {} }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("renders label, kind, summary, and episode count for active topic", async () => {
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({ status: "active", mergedIntoId: null }),
    );
    const jsx = await TopicPage({
      params: { id: "1" },
      searchParams: {},
    });
    render(jsx as React.ReactElement);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Claude Opus 4.7 release",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("release")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Anthropic released Claude Opus 4.7 with extended thinking.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("12 episodes")).toBeInTheDocument();
  });

  it("renders singular 'episode' when episodeCount === 1", async () => {
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({ status: "active", mergedIntoId: null, episodeCount: 1 }),
    );
    mockGetTopicDetailData.mockResolvedValueOnce({
      success: true,
      data: makeDetailData({ canonical: { episodeCount: 1 } }),
    });
    const jsx = await TopicPage({
      params: { id: "1" },
      searchParams: {},
    });
    render(jsx as React.ReactElement);
    expect(screen.getByText("1 episode")).toBeInTheDocument();
  });

  it("renders Dormant badge for dormant topic", async () => {
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({ status: "dormant", label: "Old topic", mergedIntoId: null }),
    );
    mockGetTopicDetailData.mockResolvedValueOnce({
      success: true,
      data: makeDetailData({
        canonical: { status: "dormant", label: "Old topic" },
      }),
    });
    const jsx = await TopicPage({
      params: { id: "2" },
      searchParams: {},
    });
    render(jsx as React.ReactElement);
    expect(
      screen.getByRole("heading", { level: 1, name: "Old topic" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Dormant")).toBeInTheDocument();
    expect(mockPermanentRedirect).not.toHaveBeenCalled();
  });

  it("calls permanentRedirect to terminal id for merged depth-1", async () => {
    mockNextTopicRow
      .mockResolvedValueOnce(
        makeTopic({ id: 10, status: "merged", mergedIntoId: 20 }),
      )
      .mockResolvedValueOnce(
        makeTopic({ id: 20, status: "active", mergedIntoId: null }),
      );
    await expect(
      TopicPage({ params: { id: "10" }, searchParams: {} }),
    ).rejects.toThrow("NEXT_REDIRECT:/topic/20");
    expect(mockPermanentRedirect).toHaveBeenCalledWith("/topic/20");
  });

  it("walks a depth-3 merged chain and redirects to terminal", async () => {
    mockNextTopicRow
      .mockResolvedValueOnce(
        makeTopic({ id: 1, status: "merged", mergedIntoId: 2 }),
      )
      .mockResolvedValueOnce(
        makeTopic({ id: 2, status: "merged", mergedIntoId: 3 }),
      )
      .mockResolvedValueOnce(
        makeTopic({ id: 3, status: "merged", mergedIntoId: 4 }),
      )
      .mockResolvedValueOnce(
        makeTopic({ id: 4, status: "active", mergedIntoId: null }),
      );
    await expect(
      TopicPage({ params: { id: "1" }, searchParams: {} }),
    ).rejects.toThrow("NEXT_REDIRECT:/topic/4");
    expect(mockPermanentRedirect).toHaveBeenCalledWith("/topic/4");
  });

  it("calls notFound() when seen-set detects a true cycle (a→b→a)", async () => {
    const a = makeTopic({ id: 5, status: "merged", mergedIntoId: 6 });
    const b = makeTopic({ id: 6, status: "merged", mergedIntoId: 5 });
    mockNextTopicRow
      .mockResolvedValueOnce(a)
      .mockResolvedValueOnce(b)
      .mockResolvedValueOnce(a);
    await expect(
      TopicPage({ params: { id: "5" }, searchParams: {} }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("calls notFound() when chain target is missing (broken chain)", async () => {
    mockNextTopicRow
      .mockResolvedValueOnce(
        makeTopic({ id: 7, status: "merged", mergedIntoId: 8 }),
      )
      .mockResolvedValueOnce(undefined);
    await expect(
      TopicPage({ params: { id: "7" }, searchParams: {} }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("calls notFound() when a merged row has null mergedIntoId (schema invariant violated)", async () => {
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({
        id: 9,
        status: "merged",
        mergedIntoId: null as unknown as number,
      } as Partial<MergedTopic>),
    );
    await expect(
      TopicPage({ params: { id: "9" }, searchParams: {} }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("succeeds at depth = MAX_MERGE_DEPTH - 1 (boundary just below threshold)", async () => {
    const totalMergedHops = MAX_MERGE_DEPTH - 1;
    for (let i = 0; i < totalMergedHops; i++) {
      mockNextTopicRow.mockResolvedValueOnce(
        makeTopic({ id: 200 + i, status: "merged", mergedIntoId: 200 + i + 1 }),
      );
    }
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({
        id: 200 + totalMergedHops,
        status: "active",
        mergedIntoId: null,
      }),
    );
    await expect(
      TopicPage({ params: { id: "200" }, searchParams: {} }),
    ).rejects.toThrow(`NEXT_REDIRECT:/topic/${200 + totalMergedHops}`);
    expect(mockPermanentRedirect).toHaveBeenCalledWith(
      `/topic/${200 + totalMergedHops}`,
    );
  });

  it("calls notFound() when chain length exceeds MAX_MERGE_DEPTH", async () => {
    const totalRows = MAX_MERGE_DEPTH + 1;
    for (let i = 0; i < totalRows; i++) {
      mockNextTopicRow.mockResolvedValueOnce(
        makeTopic({ id: 100 + i, status: "merged", mergedIntoId: 100 + i + 1 }),
      );
    }
    await expect(
      TopicPage({ params: { id: "100" }, searchParams: {} }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("redirects to dormant terminal (merged → merged → dormant)", async () => {
    mockNextTopicRow
      .mockResolvedValueOnce(
        makeTopic({ id: 30, status: "merged", mergedIntoId: 31 }),
      )
      .mockResolvedValueOnce(
        makeTopic({ id: 31, status: "merged", mergedIntoId: 32 }),
      )
      .mockResolvedValueOnce(
        makeTopic({ id: 32, status: "dormant", mergedIntoId: null }),
      );
    await expect(
      TopicPage({ params: { id: "30" }, searchParams: {} }),
    ).rejects.toThrow("NEXT_REDIRECT:/topic/32");
    expect(mockPermanentRedirect).toHaveBeenCalledWith("/topic/32");
  });

  // ────── New integration cases (issue #399 page composition) ──────

  it("renders the digest panel's consensus list when canonical has a digest", async () => {
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({ status: "active", mergedIntoId: null }),
    );
    mockGetTopicDetailData.mockResolvedValueOnce({
      success: true,
      data: makeDetailData({
        completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST + 2,
        digest: {
          id: 22,
          digestMarkdown: "# md",
          consensusPoints: ["Distinct consensus point"],
          disagreementPoints: [],
          episodeCountAtGeneration: 3,
          modelUsed: "gpt-x",
          generatedAt: new Date(),
        },
      }),
    });
    const jsx = await TopicPage({
      params: { id: "1" },
      searchParams: {},
    });
    render(jsx as React.ReactElement);
    expect(screen.getByText("Distinct consensus point")).toBeInTheDocument();
    expect(mockTriggerTopicDigestRefresh).not.toHaveBeenCalled();
  });

  it("auto-triggers digest refresh + bundles runId/token when digest is null & threshold met", async () => {
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({ status: "active", mergedIntoId: null }),
    );
    mockGetTopicDetailData.mockResolvedValueOnce({
      success: true,
      data: makeDetailData({
        completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST + 1,
        digest: null,
      }),
    });
    mockTriggerTopicDigestRefresh.mockResolvedValueOnce({
      success: true,
      data: {
        status: "queued",
        runId: "run_42",
        publicAccessToken: "tok_42",
      },
    });
    const jsx = await TopicPage({
      params: { id: "1" },
      searchParams: {},
    });
    render(jsx as React.ReactElement);
    expect(mockTriggerTopicDigestRefresh).toHaveBeenCalledWith({
      canonicalTopicId: 1,
    });
    expect(mockTriggerTopicDigestRefresh).toHaveBeenCalledTimes(1);
    // Loading state visible because the panel mounted with the runId.
    expect(screen.getByText(/synthesizing/i)).toBeInTheDocument();
  });

  it("renders the empty state and skips auto-trigger when completedSummaryCount is below threshold", async () => {
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({ status: "active", mergedIntoId: null }),
    );
    mockGetTopicDetailData.mockResolvedValueOnce({
      success: true,
      data: makeDetailData({
        completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST - 1,
        digest: null,
      }),
    });
    const jsx = await TopicPage({
      params: { id: "1" },
      searchParams: {},
    });
    render(jsx as React.ReactElement);
    expect(screen.getByText(/more coverage needed/i)).toBeInTheDocument();
    expect(mockTriggerTopicDigestRefresh).not.toHaveBeenCalled();
  });

  it("forwards searchParams.unheard='true' as showOnlyUnheard to the action", async () => {
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({ status: "active", mergedIntoId: null }),
    );
    await TopicPage({
      params: { id: "1" },
      searchParams: { unheard: "true" },
    });
    expect(mockGetTopicDetailData).toHaveBeenCalledWith({
      canonicalTopicId: 1,
      showOnlyUnheard: true,
    });
  });

  it("renders TopicEmptyState (not digest panel) when episodeCount exceeds threshold but completedSummaryCount does not", async () => {
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({ status: "active", mergedIntoId: null }),
    );
    mockGetTopicDetailData.mockResolvedValueOnce({
      success: true,
      data: makeDetailData({
        completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST - 1,
        canonical: {
          episodeCount: 10,
          completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST - 1,
        },
        digest: null,
      }),
    });
    const jsx = await TopicPage({
      params: { id: "1" },
      searchParams: {},
    });
    render(jsx as React.ReactElement);
    expect(screen.getByText(/more coverage needed/i)).toBeInTheDocument();
    expect(mockTriggerTopicDigestRefresh).not.toHaveBeenCalled();
  });

  it("renders empty state (not digest panel) for dormant topic that is eligible but has no cached digest", async () => {
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({ status: "dormant", mergedIntoId: null }),
    );
    mockGetTopicDetailData.mockResolvedValueOnce({
      success: true,
      data: makeDetailData({
        completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST + 2,
        digest: null,
        canonical: { status: "dormant" },
      }),
    });
    const jsx = await TopicPage({
      params: { id: "1" },
      searchParams: {},
    });
    render(jsx as React.ReactElement);
    // Dormant topics skip auto-trigger; showDigestPanel stays false → empty state
    expect(screen.getByText(/more coverage needed/i)).toBeInTheDocument();
    expect(mockTriggerTopicDigestRefresh).not.toHaveBeenCalled();
  });

  it("renders digest panel (not empty state) after cached auto-trigger response", async () => {
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({ status: "active", mergedIntoId: null }),
    );
    mockGetTopicDetailData.mockResolvedValueOnce({
      success: true,
      data: makeDetailData({
        completedSummaryCount: MIN_DERIVED_COUNT_FOR_DIGEST + 1,
        digest: null,
      }),
    });
    mockTriggerTopicDigestRefresh.mockResolvedValueOnce({
      success: true,
      data: { status: "cached", digestId: 5 },
    });
    const jsx = await TopicPage({
      params: { id: "1" },
      searchParams: {},
    });
    render(jsx as React.ReactElement);
    // "cached" sets showDigestPanel=true; panel mounts showing "Topic synthesis" title
    expect(screen.getByText("Topic synthesis")).toBeInTheDocument();
    expect(screen.queryByText(/more coverage needed/i)).not.toBeInTheDocument();
  });

  it("calls notFound() when getTopicDetailData returns not-found", async () => {
    mockNextTopicRow.mockResolvedValueOnce(
      makeTopic({ status: "active", mergedIntoId: null }),
    );
    mockGetTopicDetailData.mockResolvedValueOnce({
      success: false,
      error: "not-found",
    });
    await expect(
      TopicPage({ params: { id: "1" }, searchParams: {} }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
