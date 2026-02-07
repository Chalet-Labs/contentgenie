import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RatingInput } from "@/components/episodes/rating-input";

describe("RatingInput", () => {
  it("renders 5 star buttons", () => {
    render(
      <RatingInput
        initialRating={null}
        onRatingChange={vi.fn()}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(5);
  });

  it("shows 'Click to rate' label initially", () => {
    render(
      <RatingInput
        initialRating={null}
        onRatingChange={vi.fn()}
      />
    );
    expect(screen.getByText("Click to rate")).toBeInTheDocument();
  });

  it("calls onRatingChange when clicking a star", async () => {
    const onRatingChange = vi.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    render(
      <RatingInput
        initialRating={null}
        onRatingChange={onRatingChange}
      />
    );

    await user.click(screen.getByLabelText("Rate 3 stars"));
    expect(onRatingChange).toHaveBeenCalledWith(3);
  });

  it("has aria labels on each star", () => {
    render(
      <RatingInput
        initialRating={null}
        onRatingChange={vi.fn()}
      />
    );
    for (let i = 1; i <= 5; i++) {
      expect(
        screen.getByLabelText(`Rate ${i} stars`)
      ).toBeInTheDocument();
    }
  });

  it("disables buttons when disabled prop is true", () => {
    render(
      <RatingInput
        initialRating={null}
        onRatingChange={vi.fn()}
        disabled={true}
      />
    );
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("shows rating label for existing rating", () => {
    render(
      <RatingInput
        initialRating={4}
        onRatingChange={vi.fn()}
      />
    );
    expect(screen.getByText("Your rating: Great")).toBeInTheDocument();
  });

  it("hides label when showLabel is false", () => {
    render(
      <RatingInput
        initialRating={null}
        onRatingChange={vi.fn()}
        showLabel={false}
      />
    );
    expect(screen.queryByText("Click to rate")).not.toBeInTheDocument();
  });
});
