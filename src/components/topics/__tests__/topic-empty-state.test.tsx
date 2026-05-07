import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopicEmptyState } from "@/components/topics/topic-empty-state";
import { MIN_DERIVED_COUNT_FOR_DIGEST } from "@/lib/topic-digest-thresholds";

describe("TopicEmptyState", () => {
  it("renders the threshold-aware copy mentioning the unlock count", () => {
    render(<TopicEmptyState label="Claude Opus 4.7" episodeCount={2} />);
    expect(
      screen.getByText(
        (_, node) =>
          node?.textContent ===
          `More coverage needed — synthesize unlocks at ${MIN_DERIVED_COUNT_FOR_DIGEST} episodes`,
      ),
    ).toBeInTheDocument();
  });

  it.each([
    [0, /\b0 episodes\b/],
    [1, /\b1 episode\b/],
    [2, /\b2 episodes\b/],
  ] as const)(
    "renders count %i with correct singular/plural",
    (count, pattern) => {
      render(<TopicEmptyState label="Topic" episodeCount={count} />);
      expect(screen.getByText(pattern)).toBeInTheDocument();
    },
  );

  it("renders the canonical's label so the user knows which topic is gated", () => {
    render(<TopicEmptyState label="Distinctive label" episodeCount={1} />);
    expect(screen.getByText(/Distinctive label/)).toBeInTheDocument();
  });

  it("uses a heading element for the empty-state title", () => {
    render(<TopicEmptyState label="Topic" episodeCount={1} />);
    expect(
      screen.getByRole("heading", { name: /more coverage needed/i }),
    ).toBeInTheDocument();
  });

  it("renders a descriptive paragraph for accessible explanation", () => {
    const { container } = render(
      <TopicEmptyState label="Topic" episodeCount={2} />,
    );
    expect(container.querySelector("p")).not.toBeNull();
  });
});
