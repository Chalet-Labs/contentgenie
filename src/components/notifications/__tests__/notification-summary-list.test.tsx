import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { NotificationSummary } from "@/app/actions/notifications";

import { NotificationSummaryList } from "@/components/notifications/notification-summary-list";

const emptySummary: NotificationSummary = {
  totalUnread: 0,
  groups: [],
};

const lastSeenAt = new Date("2026-04-10T12:00:00.000Z");
const lastSeenIso = lastSeenAt.toISOString();

const sinceOnlySummary: NotificationSummary = {
  totalUnread: 4,
  groups: [
    { kind: "episodes_since_last_seen", count: 4, sinceIso: lastSeenIso },
  ],
};

const podcastSummary: NotificationSummary = {
  totalUnread: 3,
  groups: [
    {
      kind: "episodes_by_podcast",
      podcastId: 42,
      podcastTitle: "The Daily",
      count: 3,
    },
  ],
};

const singularSummary: NotificationSummary = {
  totalUnread: 1,
  groups: [
    {
      kind: "episodes_by_podcast",
      podcastId: 99,
      podcastTitle: "Solo Pod",
      count: 1,
    },
  ],
};

const multiGroupSummary: NotificationSummary = {
  totalUnread: 7,
  groups: [
    { kind: "episodes_since_last_seen", count: 3, sinceIso: lastSeenIso },
    {
      kind: "episodes_by_podcast",
      podcastId: 1,
      podcastTitle: "Pod Alpha",
      count: 4,
    },
    {
      kind: "episodes_by_podcast",
      podcastId: 2,
      podcastTitle: "Pod Beta",
      count: 3,
    },
  ],
};

const podcastOnlySummary: NotificationSummary = {
  totalUnread: 5,
  groups: [
    {
      kind: "episodes_by_podcast",
      podcastId: 7,
      podcastTitle: "No Since Pod",
      count: 5,
    },
  ],
};

const legacyOnlySummary: NotificationSummary = {
  // Unread rows exist (e.g., summary_completed) but none group into an episode bucket.
  totalUnread: 2,
  groups: [],
};

describe("NotificationSummaryList", () => {
  it("(a) renders empty state when totalUnread === 0", () => {
    render(<NotificationSummaryList summary={emptySummary} />);
    expect(screen.getByText(/you're all caught up/i)).toBeInTheDocument();
  });

  it("(b) episodes_since_last_seen renders correct label and link href", () => {
    render(<NotificationSummaryList summary={sinceOnlySummary} />);
    const link = screen.getByRole("link", {
      name: /4 new episodes since last visit/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      "href",
      `/notifications?since=${encodeURIComponent(lastSeenAt.toISOString())}`,
    );
  });

  it("(c) episodes_by_podcast renders correct label and link href", () => {
    render(<NotificationSummaryList summary={podcastSummary} />);
    const link = screen.getByRole("link", {
      name: /3 new episodes from the daily/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/notifications?podcast=42");
  });

  it("(d) singular label when count === 1", () => {
    render(<NotificationSummaryList summary={singularSummary} />);
    expect(
      screen.getByRole("link", { name: /1 new episode from solo pod/i }),
    ).toBeInTheDocument();
  });

  it("(e) multiple podcast groups each render one link", () => {
    render(<NotificationSummaryList summary={multiGroupSummary} />);
    expect(
      screen.getByRole("link", { name: /new episodes from pod alpha/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /new episodes from pod beta/i }),
    ).toBeInTheDocument();
  });

  it("(f) since-last-seen row renders before podcast rows", () => {
    render(<NotificationSummaryList summary={multiGroupSummary} />);
    const links = screen.getAllByRole("link");
    const sinceIndex = links.findIndex((l) =>
      l.textContent?.includes("since last visit"),
    );
    const podcastIndex = links.findIndex((l) =>
      l.textContent?.includes("from Pod Alpha"),
    );
    expect(sinceIndex).toBeLessThan(podcastIndex);
  });

  it("(g) no since-last-seen row when group absent from groups array", () => {
    render(<NotificationSummaryList summary={podcastOnlySummary} />);
    expect(
      screen.queryByRole("link", { name: /since last visit/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /no since pod/i }),
    ).toBeInTheDocument();
  });

  it("(h) unread exists but zero episode groups renders fallback link to inbox", () => {
    render(<NotificationSummaryList summary={legacyOnlySummary} />);
    // Important: we must NOT render "You're all caught up" when totalUnread > 0,
    // or the popover contradicts the bell badge for users with legacy rows.
    expect(screen.queryByText(/you're all caught up/i)).not.toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: /2 unread notifications/i,
    });
    expect(link).toHaveAttribute("href", "/notifications");
  });

  it("(i) onItemClick fires with `podcast-<id>` when a podcast row is clicked", () => {
    const onItemClick = vi.fn();
    render(
      <NotificationSummaryList
        summary={podcastSummary}
        onItemClick={onItemClick}
      />,
    );
    const link = screen.getByRole("link", { name: /from the daily/i });
    fireEvent.click(link, { button: 0 });
    expect(onItemClick).toHaveBeenCalledWith("podcast-42");
  });

  it("(j) onItemClick fires with `since-<iso>` when the since row is clicked", () => {
    const onItemClick = vi.fn();
    render(
      <NotificationSummaryList
        summary={sinceOnlySummary}
        onItemClick={onItemClick}
      />,
    );
    const link = screen.getByRole("link", { name: /since last visit/i });
    fireEvent.click(link, { button: 0 });
    expect(onItemClick).toHaveBeenCalledWith(`since-${lastSeenIso}`);
  });

  it("(k) onItemClick does NOT fire on modifier/middle clicks (open-in-new-tab intent)", () => {
    const onItemClick = vi.fn();
    render(
      <NotificationSummaryList
        summary={podcastSummary}
        onItemClick={onItemClick}
      />,
    );
    const link = screen.getByRole("link", { name: /from the daily/i });

    fireEvent.click(link, { button: 0, metaKey: true });
    fireEvent.click(link, { button: 0, ctrlKey: true });
    fireEvent.click(link, { button: 0, shiftKey: true });
    fireEvent.click(link, { button: 1 });

    expect(onItemClick).not.toHaveBeenCalled();
  });
});
