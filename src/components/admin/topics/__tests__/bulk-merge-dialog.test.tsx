import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { CanonicalTopicRow } from "@/lib/admin/topic-queries";

// cmdk requires ResizeObserver
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const mockRefresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockGetCanonicalTopicsList = vi.hoisted(() => vi.fn());
const mockBulkMergeCanonicals = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/topics", () => ({
  getCanonicalTopicsList: (...args: unknown[]) =>
    mockGetCanonicalTopicsList(...args),
  bulkMergeCanonicals: (...args: unknown[]) => mockBulkMergeCanonicals(...args),
}));

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

import { BulkMergeDialog } from "@/components/admin/topics/bulk-merge-dialog";

function makeRow(
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

const loser1 = makeRow({ id: 10, label: "TS5 beta" });
const loser2 = makeRow({ id: 11, label: "TS5 rc" });
const winnerRow = makeRow({ id: 99, label: "TypeScript 5.5 final" });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCanonicalTopicsList.mockResolvedValue({
    success: true,
    data: { rows: [], totalCount: 0 },
  });
});

describe("BulkMergeDialog", () => {
  it("renders loser summary list", () => {
    render(
      <BulkMergeDialog
        selectedTopics={[loser1, loser2]}
        open
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/TS5 beta/)).toBeInTheDocument();
    expect(screen.getByText(/TS5 rc/)).toBeInTheDocument();
  });

  it("submit button is disabled until a winner is picked", () => {
    render(
      <BulkMergeDialog selectedTopics={[loser1]} open onClose={vi.fn()} />,
    );

    const submitBtn = screen.getByRole("button", { name: /merge 1 topic/i });
    expect(submitBtn).toBeDisabled();
  });

  it("calls bulkMergeCanonicals with correct payload after winner selected", async () => {
    mockGetCanonicalTopicsList.mockResolvedValue({
      success: true,
      data: { rows: [winnerRow], totalCount: 1 },
    });
    mockBulkMergeCanonicals.mockResolvedValue({
      success: true,
      data: { succeeded: 2, failed: 0, results: [] },
    });

    render(
      <BulkMergeDialog
        selectedTopics={[loser1, loser2]}
        open
        onClose={vi.fn()}
      />,
    );

    // Trigger search to populate results
    const input = screen.getByPlaceholderText(/search winner/i);
    act(() => {
      fireEvent.change(input, { target: { value: "TypeScript" } });
    });

    // Wait for results
    await screen.findByText("TypeScript 5.5 final");

    // Click the winner CommandItem
    const item = screen.getByText("TypeScript 5.5 final");
    act(() => {
      fireEvent.click(item);
    });

    // Submit should now be enabled
    const submitBtn = screen.getByRole("button", { name: /merge 2 topic/i });
    expect(submitBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(mockBulkMergeCanonicals).toHaveBeenCalledWith({
      loserIds: [10, 11],
      winnerId: 99,
    });
    expect(mockToast.success).toHaveBeenCalledWith(
      expect.stringContaining("2 topic(s) merged"),
    );
  });

  it("shows error toast on partial failure", async () => {
    mockGetCanonicalTopicsList.mockResolvedValue({
      success: true,
      data: { rows: [winnerRow], totalCount: 1 },
    });
    mockBulkMergeCanonicals.mockResolvedValue({
      success: true,
      data: { succeeded: 1, failed: 1, results: [] },
    });

    render(
      <BulkMergeDialog
        selectedTopics={[loser1, loser2]}
        open
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText(/search winner/i);
    act(() => {
      fireEvent.change(input, { target: { value: "TypeScript" } });
    });
    await screen.findByText("TypeScript 5.5 final");
    act(() => {
      fireEvent.click(screen.getByText("TypeScript 5.5 final"));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /merge 2 topic/i }));
    });

    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining("1 failed"),
    );
  });
});
