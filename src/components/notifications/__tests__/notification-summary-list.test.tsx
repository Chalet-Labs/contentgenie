import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NotificationSummary } from "@/app/actions/notifications";

// Component does not exist yet — these tests are intentionally failing (red phase).
import { NotificationSummaryList } from "@/components/notifications/notification-summary-list";

const emptySummary: NotificationSummary = {
  totalUnread: 0,
  lastSeenAt: null,
  groups: [],
};

const lastSeenAt = new Date("2026-04-10T12:00:00.000Z");

const sinceOnlySummary: NotificationSummary = {
  totalUnread: 4,
  lastSeenAt,
  groups: [{ kind: "episodes_since_last_seen", count: 4 }],
};

const podcastSummary: NotificationSummary = {
  totalUnread: 3,
  lastSeenAt: null,
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
  lastSeenAt: null,
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
  lastSeenAt,
  groups: [
    { kind: "episodes_since_last_seen", count: 3 },
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
  lastSeenAt,
  groups: [
    {
      kind: "episodes_by_podcast",
      podcastId: 7,
      podcastTitle: "No Since Pod",
      count: 5,
    },
  ],
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
      `/notifications?since=${lastSeenAt.toISOString()}`
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
      screen.getByRole("link", { name: /1 new episode from solo pod/i })
    ).toBeInTheDocument();
  });

  it("(e) multiple podcast groups each render one link", () => {
    render(<NotificationSummaryList summary={multiGroupSummary} />);
    expect(
      screen.getByRole("link", { name: /new episodes from pod alpha/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /new episodes from pod beta/i })
    ).toBeInTheDocument();
  });

  it("(f) since-last-seen row renders before podcast rows", () => {
    render(<NotificationSummaryList summary={multiGroupSummary} />);
    const links = screen.getAllByRole("link");
    const sinceIndex = links.findIndex((l) =>
      l.textContent?.includes("since last visit")
    );
    const podcastIndex = links.findIndex((l) =>
      l.textContent?.includes("from Pod Alpha")
    );
    expect(sinceIndex).toBeLessThan(podcastIndex);
  });

  it("(g) no since-last-seen row when group absent from groups array", () => {
    render(<NotificationSummaryList summary={podcastOnlySummary} />);
    expect(
      screen.queryByRole("link", { name: /since last visit/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /no since pod/i })
    ).toBeInTheDocument();
  });
});
