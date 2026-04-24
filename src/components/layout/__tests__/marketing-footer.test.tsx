import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketingFooter } from "@/components/layout/marketing-footer";

describe("MarketingFooter", () => {
  it("renders brand + standard footer links + current year", () => {
    render(<MarketingFooter />);
    expect(screen.getAllByText(/contentgenie/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /privacy/i })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: /terms/i })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(screen.getByRole("link", { name: /changelog/i })).toHaveAttribute(
      "href",
      "/changelog",
    );
    expect(
      screen.getByRole("link", { name: /@contentgenie/i }),
    ).toHaveAttribute("href", "https://twitter.com/contentgenie");
    const year = String(new Date().getFullYear());
    expect(
      screen.getByText((content) => content.includes(year)),
    ).toBeInTheDocument();
  });
});
