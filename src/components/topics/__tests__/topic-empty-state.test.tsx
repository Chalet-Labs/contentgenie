import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopicEmptyState } from "@/components/topics/topic-empty-state";
import { MIN_DERIVED_COUNT_FOR_DIGEST } from "@/lib/topic-digest-thresholds";

describe("TopicEmptyState", () => {
  it("renders the threshold-aware copy mentioning the unlock count", () => {
    render(
      <TopicEmptyState
        label="Claude Opus 4.7"
        summarizedCount={2}
        totalEpisodeCount={4}
      />,
    );
    expect(
      screen.getByText(
        (_, node) =>
          node?.textContent ===
          `More coverage needed — synthesis unlocks at ${MIN_DERIVED_COUNT_FOR_DIGEST} summaries`,
      ),
    ).toBeInTheDocument();
  });

  it.each([
    [0, 4, /We have summarized 0 of 4 episodes/],
    [1, 3, /We have summarized 1 of 3 episode/],
    [2, 5, /We have summarized 2 of 5 episodes/],
  ] as const)(
    "renders summarized/total count %i/%i with correct copy",
    (summarizedCount, totalEpisodeCount, pattern) => {
      render(
        <TopicEmptyState
          label="Topic"
          summarizedCount={summarizedCount}
          totalEpisodeCount={totalEpisodeCount}
        />,
      );
      expect(screen.getByText(pattern)).toBeInTheDocument();
    },
  );

  it("renders the canonical's label so the user knows which topic is gated", () => {
    render(
      <TopicEmptyState
        label="Distinctive label"
        summarizedCount={1}
        totalEpisodeCount={3}
      />,
    );
    expect(screen.getByText(/Distinctive label/)).toBeInTheDocument();
  });

  it("uses a heading element for the empty-state title", () => {
    render(
      <TopicEmptyState
        label="Topic"
        summarizedCount={1}
        totalEpisodeCount={3}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /more coverage needed/i }),
    ).toBeInTheDocument();
  });
});
