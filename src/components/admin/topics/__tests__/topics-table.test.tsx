import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CanonicalTopicRow } from "@/lib/admin/topic-queries";

// Mock dialogs so we can assert open state without needing Radix pointer events.
vi.mock("@/components/admin/topics/merge-dialog", () => ({
  MergeDialog: ({
    topic,
    open,
    onClose,
  }: {
    topic: CanonicalTopicRow;
    open: boolean;
    onClose: () => void;
  }) => (
    <div data-testid="merge-dialog" data-open={open} data-topic-id={topic.id}>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock("@/components/admin/topics/bulk-merge-dialog", () => ({
  BulkMergeDialog: ({
    selectedTopics,
    open,
    onClose,
  }: {
    selectedTopics: CanonicalTopicRow[];
    open: boolean;
    onClose: () => void;
  }) => (
    <div
      data-testid="bulk-merge-dialog"
      data-open={open}
      data-count={selectedTopics.length}
      data-ids={selectedTopics.map((t) => t.id).join(",")}
    >
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

import { TopicsTable } from "@/components/admin/topics/topics-table";

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

describe("TopicsTable", () => {
  it("renders topic rows with label, kind, episode_count", () => {
    const rows: CanonicalTopicRow[] = [
      makeRow({ id: 1, label: "TypeScript 5.5", episodeCount: 7 }),
      makeRow({
        id: 2,
        label: "React 19",
        kind: "announcement",
        episodeCount: 3,
      }),
    ];
    render(
      <TopicsTable
        rows={rows}
        totalCount={2}
        currentPage={1}
        searchParams={{}}
      />,
    );

    expect(screen.getByText("TypeScript 5.5")).toBeInTheDocument();
    expect(screen.getByText("React 19")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders status badge for merged row", () => {
    const rows = [makeRow({ status: "merged", mergedIntoId: 99 })];
    render(
      <TopicsTable
        rows={rows}
        totalCount={1}
        currentPage={1}
        searchParams={{}}
      />,
    );
    expect(screen.getByText(/merged/i)).toBeInTheDocument();
  });

  it("clicking Merge button opens dialog with the clicked row as loser", async () => {
    const user = userEvent.setup();
    const rows = [makeRow({ id: 42, label: "SWC" })];
    render(
      <TopicsTable
        rows={rows}
        totalCount={1}
        currentPage={1}
        searchParams={{}}
      />,
    );

    const mergeBtn = screen.getByRole("button", { name: /^merge$/i });
    await user.click(mergeBtn);

    const dialog = screen.getByTestId("merge-dialog");
    expect(dialog).toHaveAttribute("data-open", "true");
    expect(dialog).toHaveAttribute("data-topic-id", "42");
  });

  it("shows 'No topics found' when rows is empty", () => {
    render(
      <TopicsTable
        rows={[]}
        totalCount={0}
        currentPage={1}
        searchParams={{}}
      />,
    );
    expect(screen.getByText(/no topics found/i)).toBeInTheDocument();
  });

  // ===========================================================================
  // Row selection + bulk-action bar (T11)
  // ===========================================================================

  it("renders a checkbox for each row", () => {
    const rows = [
      makeRow({ id: 1, label: "A" }),
      makeRow({ id: 2, label: "B" }),
    ];
    render(
      <TopicsTable
        rows={rows}
        totalCount={2}
        currentPage={1}
        searchParams={{}}
      />,
    );
    // Header checkbox + 2 row checkboxes
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(3);
  });

  it("checkbox is disabled for non-active rows", () => {
    const rows = [makeRow({ id: 1, status: "merged", mergedIntoId: 99 })];
    render(
      <TopicsTable
        rows={rows}
        totalCount={1}
        currentPage={1}
        searchParams={{}}
      />,
    );
    const rowCheckbox = screen.getByRole("checkbox", {
      name: /select TypeScript 5\.5/i,
    });
    expect(rowCheckbox).toBeDisabled();
  });

  it("bulk-action bar appears when a row is selected", () => {
    const rows = [makeRow({ id: 1, label: "TS", status: "active" })];
    render(
      <TopicsTable
        rows={rows}
        totalCount={1}
        currentPage={1}
        searchParams={{}}
      />,
    );

    const rowCheckbox = screen.getByRole("checkbox", { name: /select TS/i });
    act(() => {
      fireEvent.click(rowCheckbox);
    });

    expect(
      screen.getByRole("button", { name: /merge selected/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear selection/i }),
    ).toBeInTheDocument();
  });

  it("'Merge selected' opens bulk-merge dialog with selected topics", () => {
    const rows = [
      makeRow({ id: 10, label: "Alpha", status: "active" }),
      makeRow({ id: 11, label: "Beta", status: "active" }),
    ];
    render(
      <TopicsTable
        rows={rows}
        totalCount={2}
        currentPage={1}
        searchParams={{}}
      />,
    );

    // Select both rows
    act(() => {
      fireEvent.click(screen.getByRole("checkbox", { name: /select Alpha/i }));
      fireEvent.click(screen.getByRole("checkbox", { name: /select Beta/i }));
    });

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /merge selected/i }));
    });

    const dialog = screen.getByTestId("bulk-merge-dialog");
    expect(dialog).toHaveAttribute("data-open", "true");
    expect(dialog).toHaveAttribute("data-count", "2");
    expect(dialog).toHaveAttribute("data-ids", "10,11");
  });

  it("clears selection when the page changes", () => {
    const rows = [makeRow({ id: 1, label: "Alpha", status: "active" })];
    const { rerender } = render(
      <TopicsTable
        rows={rows}
        totalCount={5}
        currentPage={1}
        searchParams={{}}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByRole("checkbox", { name: /select Alpha/i }));
    });
    expect(
      screen.getByRole("button", { name: /merge selected/i }),
    ).toBeInTheDocument();

    rerender(
      <TopicsTable
        rows={rows}
        totalCount={5}
        currentPage={2}
        searchParams={{}}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /merge selected/i }),
    ).not.toBeInTheDocument();
  });

  it("clears selection when filters change", () => {
    const rows = [makeRow({ id: 1, label: "Alpha", status: "active" })];
    const { rerender } = render(
      <TopicsTable
        rows={rows}
        totalCount={1}
        currentPage={1}
        searchParams={{ status: "active" }}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByRole("checkbox", { name: /select Alpha/i }));
    });
    expect(
      screen.getByRole("button", { name: /merge selected/i }),
    ).toBeInTheDocument();

    rerender(
      <TopicsTable
        rows={rows}
        totalCount={1}
        currentPage={1}
        searchParams={{ status: "merged" }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /merge selected/i }),
    ).not.toBeInTheDocument();
  });
});
