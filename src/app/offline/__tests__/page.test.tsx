import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import OfflinePage from "@/app/offline/page";

describe("OfflinePage", () => {
  it("renders the offline heading", () => {
    render(<OfflinePage />);
    expect(screen.getByText("You are offline")).toBeInTheDocument();
  });

  it("renders explanatory text", () => {
    render(<OfflinePage />);
    expect(
      screen.getByText(/contentgenie needs an internet connection/i)
    ).toBeInTheDocument();
  });

  it("renders a Retry button", () => {
    render(<OfflinePage />);
    expect(
      screen.getByRole("button", { name: /retry/i })
    ).toBeInTheDocument();
  });
});
