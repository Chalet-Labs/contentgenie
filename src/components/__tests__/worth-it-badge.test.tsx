import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorthItBadge } from "@/components/episodes/worth-it-badge";

describe("WorthItBadge", () => {
  it("renders nothing when score is null", () => {
    const { container } = render(<WorthItBadge score={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders score value and label for high score (>= 8)", () => {
    render(<WorthItBadge score={8.5} />);
    const badge = screen.getByText(/8\.5/);
    expect(badge).toHaveTextContent("8.5");
    expect(badge).toHaveTextContent("Exceptional");
  });

  it("renders score value and label for mid score (4-5.9)", () => {
    render(<WorthItBadge score={4.5} />);
    const badge = screen.getByText(/4\.5/);
    expect(badge).toHaveTextContent("4.5");
    expect(badge).toHaveTextContent("Average");
  });

  it("renders score value and label for low score (< 2)", () => {
    render(<WorthItBadge score={1.0} />);
    const badge = screen.getByText(/1\.0/);
    expect(badge).toHaveTextContent("1.0");
    expect(badge).toHaveTextContent("Skip");
  });

  it("displays score with one decimal place", () => {
    render(<WorthItBadge score={7} />);
    expect(screen.getByText(/7\.0/)).toBeInTheDocument();
  });
});
