import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CanonicalTopicRow } from "@/lib/admin/topic-queries";

// Mock the dialog so we can assert it opens.
const mockOnMerge = vi.fn();
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

    const mergeBtn = screen.getByRole("button", { name: /merge/i });
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
});
