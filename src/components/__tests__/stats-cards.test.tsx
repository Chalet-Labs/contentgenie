import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsCards } from "@/components/dashboard/stats-cards";

describe("StatsCards", () => {
  it("renders subscription and saved counts", () => {
    render(<StatsCards subscriptionCount={5} savedCount={12} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders card titles", () => {
    render(<StatsCards subscriptionCount={0} savedCount={0} />);
    expect(screen.getByText("Subscriptions")).toBeInTheDocument();
    expect(screen.getByText("Saved Episodes")).toBeInTheDocument();
    expect(screen.getByText("Discover")).toBeInTheDocument();
    expect(screen.getByText("Library")).toBeInTheDocument();
  });

  it("links to correct pages", () => {
    render(<StatsCards subscriptionCount={0} savedCount={0} />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/subscriptions");
    expect(hrefs).toContain("/library");
    expect(hrefs).toContain("/discover");
  });

  it("shows skeletons when loading", () => {
    render(
      <StatsCards subscriptionCount={0} savedCount={0} isLoading={true} />
    );
    // Should not show actual text content
    expect(screen.queryByText("Subscriptions")).not.toBeInTheDocument();
    // Loading state renders cards without links
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("handles zero counts", () => {
    render(<StatsCards subscriptionCount={0} savedCount={0} />);
    // Should show "0" twice (subscriptions + saved)
    const zeros = screen.getAllByText("0");
    expect(zeros).toHaveLength(2);
  });
});
