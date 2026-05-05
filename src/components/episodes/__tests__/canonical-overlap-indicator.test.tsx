import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CanonicalOverlapIndicator } from "@/components/episodes/canonical-overlap-indicator";
import type { CanonicalOverlapResult } from "@/lib/topic-overlap";

describe("CanonicalOverlapIndicator", () => {
  it("renders repeat copy with count and topicLabel", () => {
    const overlap: CanonicalOverlapResult = {
      kind: "repeat",
      count: 3,
      topicLabel: "creatine",
      topicId: 1,
    };
    render(<CanonicalOverlapIndicator overlap={overlap} />);
    expect(
      screen.getByText("You've heard 3 episodes on creatine"),
    ).toBeInTheDocument();
  });

  it("renders new copy with topicLabel", () => {
    const overlap: CanonicalOverlapResult = {
      kind: "new",
      topicLabel: "OpenAI o4 preview",
      topicId: 2,
    };
    render(<CanonicalOverlapIndicator overlap={overlap} />);
    expect(screen.getByText("New: OpenAI o4 preview")).toBeInTheDocument();
  });

  it("sets data-canonical-overlap-kind attribute to overlap kind", () => {
    const repeatOverlap: CanonicalOverlapResult = {
      kind: "repeat",
      count: 1,
      topicLabel: "nutrition",
      topicId: 5,
    };
    const { rerender } = render(
      <CanonicalOverlapIndicator overlap={repeatOverlap} />,
    );
    expect(screen.getByTestId("overlap-indicator")).toHaveAttribute(
      "data-canonical-overlap-kind",
      "repeat",
    );

    const newOverlap: CanonicalOverlapResult = {
      kind: "new",
      topicLabel: "nutrition",
      topicId: 5,
    };
    rerender(<CanonicalOverlapIndicator overlap={newOverlap} />);
    expect(screen.getByTestId("overlap-indicator")).toHaveAttribute(
      "data-canonical-overlap-kind",
      "new",
    );
  });

  it("applies additional className alongside default classes", () => {
    const overlap: CanonicalOverlapResult = {
      kind: "new",
      topicLabel: "sleep",
      topicId: 7,
    };
    render(<CanonicalOverlapIndicator overlap={overlap} className="mt-1.5" />);
    const el = screen.getByTestId("overlap-indicator");
    expect(el.className).toContain("mt-1.5");
  });
});
