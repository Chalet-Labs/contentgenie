import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CanonicalTopicRow } from "@/lib/admin/topic-queries";

// cmdk (used by Command) requires ResizeObserver which jsdom doesn't provide.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Mock router
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// Mock server actions
const mockGetCanonicalTopicsList = vi.fn();
const mockAdminMergeCanonicals = vi.fn();
vi.mock("@/app/actions/topics", () => ({
  getCanonicalTopicsList: (...args: unknown[]) =>
    mockGetCanonicalTopicsList(...args),
  adminMergeCanonicals: (...args: unknown[]) =>
    mockAdminMergeCanonicals(...args),
}));

// Mock toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { MergeDialog } from "@/components/admin/topics/merge-dialog";

function makeTopic(
  overrides: Partial<CanonicalTopicRow> = {},
): CanonicalTopicRow {
  return {
    id: 1,
    label: "TypeScript 5.5",
    kind: "release",
    status: "active",
    episodeCount: 7,
    lastSeen: new Date("2026-01-01"),
    mergedIntoId: null,
    ...overrides,
  };
}

function makeSearchResult(id: number, label: string): CanonicalTopicRow {
  return makeTopic({ id, label });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCanonicalTopicsList.mockResolvedValue({
    success: true,
    data: { rows: [], totalCount: 0 },
  });
});

describe("MergeDialog", () => {
  it("shows the loser topic label in the dialog", () => {
    render(
      <MergeDialog
        topic={makeTopic({ id: 1, label: "TypeScript 5.5" })}
        open
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/TypeScript 5\.5/i)).toBeInTheDocument();
  });

  it("typing in search calls getCanonicalTopicsList", async () => {
    const user = userEvent.setup();
    mockGetCanonicalTopicsList.mockResolvedValue({
      success: true,
      data: {
        rows: [makeSearchResult(2, "React 19")],
        totalCount: 1,
      },
    });

    render(<MergeDialog topic={makeTopic({ id: 1 })} open onClose={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText(/search topics/i);
    await user.type(searchInput, "React");

    await waitFor(() => {
      expect(mockGetCanonicalTopicsList).toHaveBeenCalledWith(
        expect.objectContaining({ search: expect.stringContaining("React") }),
      );
    });
  });

  it("selecting a winner and confirming calls adminMergeCanonicals", async () => {
    const user = userEvent.setup();
    mockGetCanonicalTopicsList.mockResolvedValue({
      success: true,
      data: {
        rows: [makeSearchResult(99, "React 19")],
        totalCount: 1,
      },
    });
    mockAdminMergeCanonicals.mockResolvedValue({
      success: true,
      data: { loserId: 1, winnerId: 99, episodesReassigned: 3 },
    });

    render(<MergeDialog topic={makeTopic({ id: 1 })} open onClose={vi.fn()} />);

    // Type to trigger search
    const searchInput = screen.getByPlaceholderText(/search topics/i);
    await user.type(searchInput, "React");

    // Wait for result and click it
    await waitFor(() => screen.getByText("React 19"));
    await user.click(screen.getByText("React 19"));

    // Confirm
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect(confirmBtn).not.toBeDisabled();
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockAdminMergeCanonicals).toHaveBeenCalledWith({
        loserId: 1,
        winnerId: 99,
      });
    });
  });

  it("Confirm button is disabled until a winner is selected", () => {
    render(<MergeDialog topic={makeTopic({ id: 1 })} open onClose={vi.fn()} />);
    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("shows error toast when merge fails", async () => {
    const user = userEvent.setup();
    mockGetCanonicalTopicsList.mockResolvedValue({
      success: true,
      data: { rows: [makeSearchResult(99, "React 19")], totalCount: 1 },
    });
    mockAdminMergeCanonicals.mockResolvedValue({
      success: false,
      error: "self-merge",
    });
    const { toast } = await import("sonner");

    render(<MergeDialog topic={makeTopic({ id: 1 })} open onClose={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText(/search topics/i);
    await user.type(searchInput, "React");
    await waitFor(() => screen.getByText("React 19"));
    await user.click(screen.getByText("React 19"));
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
