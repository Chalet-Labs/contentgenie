import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// notFound and permanentRedirect throw internally — mirror that in tests so
// the page function stops executing at the right point.
const mockNotFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const mockPermanentRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  notFound: () => mockNotFound(),
  permanentRedirect: (url: string) => mockPermanentRedirect(url),
}));

// Control the DB response per test case.
const mockFindFirst = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      canonicalTopics: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
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

import TopicPage from "@/app/(app)/topic/[id]/page";

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

describe("TopicPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls notFound() for NaN id", async () => {
    await expect(TopicPage({ params: { id: "abc" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("calls notFound() for negative id", async () => {
    await expect(TopicPage({ params: { id: "-1" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("calls notFound() for zero id", async () => {
    await expect(TopicPage({ params: { id: "0" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("calls notFound() when DB returns null", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(TopicPage({ params: { id: "1" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("renders label, kind, summary, episodeCount, and 'Coming soon' for active topic", async () => {
    mockFindFirst.mockResolvedValueOnce(
      makeTopic({ status: "active", mergedIntoId: null }),
    );
    const jsx = await TopicPage({ params: { id: "1" } });
    render(jsx as React.ReactElement);
    expect(screen.getByText("Claude Opus 4.7 release")).toBeInTheDocument();
    // Kind badge
    expect(screen.getByText("release")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Anthropic released Claude Opus 4.7 with extended thinking.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/Coming soon/i)).toBeInTheDocument();
  });

  it("renders normally for dormant topic (no banner or 404)", async () => {
    mockFindFirst.mockResolvedValueOnce(
      makeTopic({ status: "dormant", label: "Old topic", mergedIntoId: null }),
    );
    const jsx = await TopicPage({ params: { id: "2" } });
    render(jsx as React.ReactElement);
    expect(screen.getByText("Old topic")).toBeInTheDocument();
    expect(screen.getByText(/Coming soon/i)).toBeInTheDocument();
    expect(mockPermanentRedirect).not.toHaveBeenCalled();
  });

  it("calls permanentRedirect to terminal id for merged depth-1", async () => {
    mockFindFirst
      .mockResolvedValueOnce(
        makeTopic({ id: 10, status: "merged", mergedIntoId: 20 }),
      )
      .mockResolvedValueOnce(
        makeTopic({ id: 20, status: "active", mergedIntoId: null }),
      );
    await expect(TopicPage({ params: { id: "10" } })).rejects.toThrow(
      "NEXT_REDIRECT:/topic/20",
    );
    expect(mockPermanentRedirect).toHaveBeenCalledWith("/topic/20");
  });

  it("walks a depth-3 merged chain and redirects to terminal", async () => {
    mockFindFirst
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
    await expect(TopicPage({ params: { id: "1" } })).rejects.toThrow(
      "NEXT_REDIRECT:/topic/4",
    );
    expect(mockPermanentRedirect).toHaveBeenCalledWith("/topic/4");
  });

  it("calls notFound() for a cycle (a→b→a)", async () => {
    mockFindFirst
      .mockResolvedValueOnce(
        makeTopic({ id: 5, status: "merged", mergedIntoId: 6 }),
      )
      .mockResolvedValueOnce(
        makeTopic({ id: 6, status: "merged", mergedIntoId: 5 }), // cycle back
      );
    await expect(TopicPage({ params: { id: "5" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("calls notFound() when max depth exceeded", async () => {
    // Return 17 consecutive merged rows (exceeds MAX_MERGE_DEPTH=16)
    let id = 100;
    while (id <= 116) {
      mockFindFirst.mockResolvedValueOnce(
        makeTopic({ id, status: "merged", mergedIntoId: id + 1 }),
      );
      id++;
    }
    await expect(TopicPage({ params: { id: "100" } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it("redirects to dormant terminal (merged → merged → dormant)", async () => {
    mockFindFirst
      .mockResolvedValueOnce(
        makeTopic({ id: 30, status: "merged", mergedIntoId: 31 }),
      )
      .mockResolvedValueOnce(
        makeTopic({ id: 31, status: "merged", mergedIntoId: 32 }),
      )
      .mockResolvedValueOnce(
        makeTopic({ id: 32, status: "dormant", mergedIntoId: null }),
      );
    await expect(TopicPage({ params: { id: "30" } })).rejects.toThrow(
      "NEXT_REDIRECT:/topic/32",
    );
    expect(mockPermanentRedirect).toHaveBeenCalledWith("/topic/32");
  });
});
