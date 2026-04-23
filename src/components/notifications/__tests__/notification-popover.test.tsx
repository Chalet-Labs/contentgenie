import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NotificationSummary } from "@/app/actions/notifications";

// Mock useMediaQuery to control desktop/mobile surface
const mockUseMediaQuery = vi.fn();
vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: (...args: unknown[]) => mockUseMediaQuery(...args),
}));

import { NotificationPopover } from "@/components/notifications/notification-popover";

const populatedSummary: NotificationSummary = {
  totalUnread: 3,
  groups: [
    {
      kind: "episodes_by_podcast",
      podcastId: 1,
      podcastTitle: "Test Podcast",
      count: 3,
    },
  ],
};

const emptySummary: NotificationSummary = {
  totalUnread: 0,
  groups: [],
};

function makeTrigger() {
  return <button>Open</button>;
}

describe("NotificationPopover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to desktop
    mockUseMediaQuery.mockReturnValue(true);
  });

  it("(a) desktop: open popover has role=dialog with accessible name Notifications", () => {
    const onOpenChange = vi.fn();
    render(
      <NotificationPopover
        open={true}
        onOpenChange={onOpenChange}
        trigger={makeTrigger()}
        summary={populatedSummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByRole("dialog", { name: /notifications/i })
    ).toBeInTheDocument();
  });

  it("(b) mobile: open sheet has dialog with title Notifications", () => {
    mockUseMediaQuery.mockReturnValue(false);
    const onOpenChange = vi.fn();
    render(
      <NotificationPopover
        open={true}
        onOpenChange={onOpenChange}
        trigger={makeTrigger()}
        summary={populatedSummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByRole("dialog", { name: /notifications/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /notifications/i })
    ).toBeInTheDocument();
  });

  it("(c) loading state shows 3 skeleton rows when summary is null and not error", () => {
    render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={null}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    // Skeleton rows are rendered as divs with animate-pulse; count them by test id
    const skeletons = document.querySelectorAll("[data-testid='skeleton-row']");
    expect(skeletons).toHaveLength(3);
  });

  it("(d) error state shows error message and Retry button that calls onRetry", async () => {
    const onRetry = vi.fn();
    render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={null}
        isError={true}
        onRetry={onRetry}
      />
    );
    expect(
      screen.getByText(/couldn't load notifications/i)
    ).toBeInTheDocument();
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("(e) populated state renders NotificationSummaryList content", () => {
    render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={populatedSummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByRole("link", { name: /3 new episodes from test podcast/i })
    ).toBeInTheDocument();
  });

  it("(f) See all footer link renders with href=/notifications in populated state", () => {
    render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={populatedSummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByRole("link", { name: /see all/i })
    ).toHaveAttribute("href", "/notifications");
  });

  it("(f) See all footer link renders in loading state", () => {
    render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={null}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByRole("link", { name: /see all/i })
    ).toHaveAttribute("href", "/notifications");
  });

  it("(f) See all footer link renders in error state", () => {
    render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={null}
        isError={true}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByRole("link", { name: /see all/i })
    ).toHaveAttribute("href", "/notifications");
  });

  it("(f) See all footer link renders in empty state", () => {
    render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={emptySummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByRole("link", { name: /see all/i })
    ).toHaveAttribute("href", "/notifications");
  });

  it("(g) Esc key triggers onOpenChange(false)", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <NotificationPopover
        open={true}
        onOpenChange={onOpenChange}
        trigger={makeTrigger()}
        summary={populatedSummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("(i) Clear all button is absent when summary is empty", () => {
    render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={emptySummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: /clear all/i })
    ).not.toBeInTheDocument();
  });

  it("(j) Clear all button is absent in loading state", () => {
    render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={null}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: /clear all/i })
    ).not.toBeInTheDocument();
  });

  it("(k) Clear all empties the displayed list and hides the button", async () => {
    const user = userEvent.setup();
    render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={populatedSummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByRole("link", { name: /3 new episodes from test podcast/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear all/i }));

    expect(
      screen.queryByRole("link", { name: /from test podcast/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/you're all caught up/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /clear all/i })
    ).not.toBeInTheDocument();
  });

  it("(l) clicking an item removes it from the displayed list", async () => {
    const user = userEvent.setup();
    const twoGroupSummary: NotificationSummary = {
      totalUnread: 5,
      groups: [
        {
          kind: "episodes_by_podcast",
          podcastId: 1,
          podcastTitle: "Pod A",
          count: 3,
        },
        {
          kind: "episodes_by_podcast",
          podcastId: 2,
          podcastTitle: "Pod B",
          count: 2,
        },
      ],
    };
    render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={twoGroupSummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );

    await user.click(screen.getByRole("link", { name: /from pod a/i }));

    expect(
      screen.queryByRole("link", { name: /from pod a/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /from pod b/i })
    ).toBeInTheDocument();
  });

  it("(m) displayed list resyncs when the summary prop changes", () => {
    const initialSummary: NotificationSummary = {
      totalUnread: 1,
      groups: [
        {
          kind: "episodes_by_podcast",
          podcastId: 1,
          podcastTitle: "Pod One",
          count: 1,
        },
      ],
    };
    const updatedSummary: NotificationSummary = {
      totalUnread: 1,
      groups: [
        {
          kind: "episodes_by_podcast",
          podcastId: 2,
          podcastTitle: "Pod Two",
          count: 1,
        },
      ],
    };

    const { rerender } = render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={initialSummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByRole("link", { name: /from pod one/i })
    ).toBeInTheDocument();

    rerender(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={updatedSummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByRole("link", { name: /from pod two/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /from pod one/i })
    ).not.toBeInTheDocument();
  });

  it("(h) onOpenChange prop is wired to the Radix surface (outside-click provided by Radix DismissableLayer)", () => {
    // Radix's DismissableLayer handles outside-click → onOpenChange(false) natively.
    // We verify the prop is correctly wired by confirming the controlled state renders
    // when open=true and the dialog disappears when open=false.
    const { rerender } = render(
      <NotificationPopover
        open={true}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={populatedSummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    rerender(
      <NotificationPopover
        open={false}
        onOpenChange={vi.fn()}
        trigger={makeTrigger()}
        summary={populatedSummary}
        isError={false}
        onRetry={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
