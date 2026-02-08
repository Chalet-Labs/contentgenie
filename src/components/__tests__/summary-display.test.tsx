import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SummaryDisplay } from "@/components/episodes/summary-display";

describe("SummaryDisplay", () => {
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
    expect(screen.getByText("Highly Recommended")).toBeInTheDocument();
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
    expect(screen.getByText("Highly Recommended")).toBeInTheDocument();

    rerender(
      <SummaryDisplay
        summary="Summary"
        keyTakeaways={[]}
        worthItScore={6}
      />
    );
    expect(screen.getByText("Worth Your Time")).toBeInTheDocument();

    rerender(
      <SummaryDisplay
        summary="Summary"
        keyTakeaways={[]}
        worthItScore={4}
      />
    );
    expect(screen.getByText("Decent")).toBeInTheDocument();

    rerender(
      <SummaryDisplay
        summary="Summary"
        keyTakeaways={[]}
        worthItScore={2}
      />
    );
    expect(screen.getByText("Skip Unless Interested")).toBeInTheDocument();

    rerender(
      <SummaryDisplay
        summary="Summary"
        keyTakeaways={[]}
        worthItScore={1}
      />
    );
    expect(screen.getByText("Not Recommended")).toBeInTheDocument();
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
});
