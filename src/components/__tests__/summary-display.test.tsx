import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SummaryDisplay } from "@/components/episodes/summary-display";

describe("SummaryDisplay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("shows loading state with skeleton fallback", () => {
    render(
      <SummaryDisplay
        summary={null}
        keyTakeaways={null}
        worthItScore={null}
        isLoading={true}
      />
    );
    expect(screen.getByText("Generating Summary...")).toBeInTheDocument();
  });

  it("shows loading state with step progress", () => {
    render(
      <SummaryDisplay
        summary={null}
        keyTakeaways={null}
        worthItScore={null}
        isLoading={true}
        currentStep="generating-summary"
      />
    );
    expect(screen.getByText("Generating Summary...")).toBeInTheDocument();
    expect(screen.getByText("Generating AI summary")).toBeInTheDocument();
    expect(screen.getByText("Fetching episode data")).toBeInTheDocument();
  });

  it("shows error state with retry button", () => {
    const onRetry = vi.fn();
    render(
      <SummaryDisplay
        summary={null}
        keyTakeaways={null}
        worthItScore={null}
        error="Something went wrong"
        onGenerateSummary={onRetry}
      />
    );
    expect(
      screen.getByText("Failed to generate summary")
    ).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("shows 'No Summary Available' when no summary", () => {
    const onGenerate = vi.fn();
    render(
      <SummaryDisplay
        summary={null}
        keyTakeaways={null}
        worthItScore={null}
        onGenerateSummary={onGenerate}
      />
    );
    expect(screen.getByText("No Summary Available")).toBeInTheDocument();
    expect(screen.getByText("Generate Summary")).toBeInTheDocument();
  });

  it("renders full summary with score and takeaways", () => {
    render(
      <SummaryDisplay
        summary="This is a great episode summary."
        keyTakeaways={["Takeaway 1", "Takeaway 2", "Takeaway 3"]}
        worthItScore={8.5}
        worthItReason="Excellent content"
      />
    );
    expect(
      screen.getByText("This is a great episode summary.")
    ).toBeInTheDocument();
    expect(screen.getByText("8.5")).toBeInTheDocument();
    expect(screen.getByText("Exceptional")).toBeInTheDocument();
    expect(screen.getByText("Excellent content")).toBeInTheDocument();
    expect(screen.getByText("Takeaway 1")).toBeInTheDocument();
    expect(screen.getByText("Takeaway 2")).toBeInTheDocument();
    expect(screen.getByText("Takeaway 3")).toBeInTheDocument();
  });

  it("truncates long summaries and shows 'Read More'", async () => {
    const longSummary = "A".repeat(700);
    const user = userEvent.setup();

    render(
      <SummaryDisplay
        summary={longSummary}
        keyTakeaways={[]}
        worthItScore={5}
      />
    );

    expect(screen.getByText("Read More")).toBeInTheDocument();
    // Should be truncated
    expect(screen.queryByText(longSummary)).not.toBeInTheDocument();

    await user.click(screen.getByText("Read More"));
    expect(screen.getByText("Show Less")).toBeInTheDocument();
  });

  it("shows correct score labels", () => {
    const { rerender } = render(
      <SummaryDisplay
        summary="Summary"
        keyTakeaways={[]}
        worthItScore={9}
      />
    );
    expect(screen.getByText("Exceptional")).toBeInTheDocument();

    rerender(
      <SummaryDisplay
        summary="Summary"
        keyTakeaways={[]}
        worthItScore={6}
      />
    );
    expect(screen.getByText("Above Average")).toBeInTheDocument();

    rerender(
      <SummaryDisplay
        summary="Summary"
        keyTakeaways={[]}
        worthItScore={4}
      />
    );
    expect(screen.getByText("Average")).toBeInTheDocument();

    rerender(
      <SummaryDisplay
        summary="Summary"
        keyTakeaways={[]}
        worthItScore={2}
      />
    );
    expect(screen.getByText("Below Average")).toBeInTheDocument();

    rerender(
      <SummaryDisplay
        summary="Summary"
        keyTakeaways={[]}
        worthItScore={1}
      />
    );
    expect(screen.getByText("Skip")).toBeInTheDocument();
  });

  it("does not show score section when worthItScore is null", () => {
    render(
      <SummaryDisplay
        summary="Summary text"
        keyTakeaways={[]}
        worthItScore={null}
      />
    );
    expect(screen.queryByText("Worth-It Score")).not.toBeInTheDocument();
  });

  it("renders structured summary with headings as separate blocks", () => {
    const structuredSummary =
      "## TL;DR\nA quick overview.\n\n## What You'll Learn\n- Item 1";
    render(
      <SummaryDisplay
        summary={structuredSummary}
        keyTakeaways={[]}
        worthItScore={7}
      />
    );
    expect(screen.getByText("TL;DR")).toBeInTheDocument();
    expect(screen.getByText("A quick overview.")).toBeInTheDocument();
    // Second section is hidden by default (collapsed to first section only)
    expect(screen.queryByText("What You'll Learn")).not.toBeInTheDocument();
    expect(screen.getByText("Read More")).toBeInTheDocument();
  });

  it("expands all structured sections when Read More is clicked", async () => {
    const user = userEvent.setup();
    const structuredSummary =
      "## TL;DR\nA quick overview.\n\n## What You'll Learn\n- Item 1";
    render(
      <SummaryDisplay
        summary={structuredSummary}
        keyTakeaways={[]}
        worthItScore={7}
      />
    );
    await user.click(screen.getByText("Read More"));
    expect(screen.getByText("What You'll Learn")).toBeInTheDocument();
    expect(screen.getByText("Show Less")).toBeInTheDocument();
  });

  it("renders score breakdown labels when worthItDimensions is present", () => {
    render(
      <SummaryDisplay
        summary="Short summary."
        keyTakeaways={[]}
        worthItScore={7}
        worthItDimensions={{ uniqueness: 3, actionability: 4, timeValue: 9 }}
      />
    );
    expect(screen.getByText("Score Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Uniqueness")).toBeInTheDocument();
    expect(screen.getByText("Actionability")).toBeInTheDocument();
    expect(screen.getByText("Time Value")).toBeInTheDocument();
  });

  it("omits invalid dimension entries from score breakdown", () => {
    render(
      <SummaryDisplay
        summary="Short summary."
        keyTakeaways={[]}
        worthItScore={7}
        worthItDimensions={{
          uniqueness: 8,
          actionability: NaN as unknown as number,
          timeValue: 6,
        }}
      />
    );
    expect(screen.getByText("Score Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Uniqueness")).toBeInTheDocument();
    expect(screen.queryByText("Actionability")).not.toBeInTheDocument();
    expect(screen.getByText("Time Value")).toBeInTheDocument();
  });
});
