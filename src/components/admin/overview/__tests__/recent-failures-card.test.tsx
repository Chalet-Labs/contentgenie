import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentFailuresCard } from "@/components/admin/overview/recent-failures-card";
import type { RecentFailure } from "@/lib/admin/overview-queries";

const mockFailures: RecentFailure[] = [
  {
    id: 1,
    title: "Episode One That Failed",
    transcriptStatus: "failed",
    summaryStatus: null,
    updatedAt: new Date(Date.now() - 3600000), // 1 hour ago
    transcriptError: "Connection timeout while fetching transcript",
    processingError: null,
  },
  {
    id: 2,
    title: "Episode Two With Summary Failure",
    transcriptStatus: "available",
    summaryStatus: "failed",
    updatedAt: new Date(Date.now() - 7200000), // 2 hours ago
    transcriptError: null,
    processingError: "OpenRouter API error: rate limited",
  },
];

describe("RecentFailuresCard", () => {
  it("renders episode titles", () => {
    render(<RecentFailuresCard failures={mockFailures} />);
    expect(screen.getByText("Episode One That Failed")).toBeInTheDocument();
    expect(
      screen.getByText("Episode Two With Summary Failure"),
    ).toBeInTheDocument();
  });

  it("renders status badges", () => {
    render(<RecentFailuresCard failures={mockFailures} />);
    const failedBadges = screen.getAllByText("failed");
    expect(failedBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("truncates error messages to 80 chars", () => {
    const longError = "A".repeat(100);
    render(
      <RecentFailuresCard
        failures={[
          {
            ...mockFailures[0],
            transcriptError: longError,
          },
        ]}
      />,
    );
    // Should show first 80 chars
    expect(screen.getByText("A".repeat(80))).toBeInTheDocument();
  });

  it("shows empty state when no failures", () => {
    render(<RecentFailuresCard failures={[]} />);
    expect(screen.getByText("No recent failures.")).toBeInTheDocument();
  });
});
