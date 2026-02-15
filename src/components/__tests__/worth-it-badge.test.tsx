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
    expect(screen.getByText("8.5")).toBeInTheDocument();
    expect(screen.getByText("Highly Recommended")).toBeInTheDocument();
  });

  it("renders score value and label for mid score (4-5.9)", () => {
    render(<WorthItBadge score={4.5} />);
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("Decent")).toBeInTheDocument();
  });

  it("renders score value and label for low score (< 2)", () => {
    render(<WorthItBadge score={1.0} />);
    expect(screen.getByText("1.0")).toBeInTheDocument();
    expect(screen.getByText("Not Recommended")).toBeInTheDocument();
  });

  it("displays score with one decimal place", () => {
    render(<WorthItBadge score={7} />);
    expect(screen.getByText("7.0")).toBeInTheDocument();
  });
});
