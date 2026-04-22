import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShowMoreToggle } from "@/components/ui/show-more-toggle";

describe("ShowMoreToggle", () => {
  it("renders 'Show N more' with aria-expanded=false when collapsed", () => {
    render(<ShowMoreToggle expanded={false} hiddenCount={3} onToggle={() => {}} />);
    const btn = screen.getByRole("button", { name: "Show 3 more" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("renders 'Show less' with aria-expanded=true when expanded", () => {
    render(<ShowMoreToggle expanded={true} hiddenCount={3} onToggle={() => {}} />);
    const btn = screen.getByRole("button", { name: /show less/i });
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("renders 'Show 1 more' for singular-count boundary", () => {
    render(<ShowMoreToggle expanded={false} hiddenCount={1} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "Show 1 more" })).toBeInTheDocument();
  });

  it("invokes onToggle exactly once per click", async () => {
    const onToggle = vi.fn();
    render(<ShowMoreToggle expanded={false} hiddenCount={2} onToggle={onToggle} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("applies a custom className alongside the default w-full/mt-2", () => {
    render(
      <ShowMoreToggle
        expanded={false}
        hiddenCount={2}
        onToggle={() => {}}
        className="custom-class"
      />,
    );
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("custom-class");
    expect(btn.className).toContain("w-full");
    expect(btn.className).toContain("mt-2");
  });
});
