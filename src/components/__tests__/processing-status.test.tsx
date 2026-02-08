import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProcessingStatus } from "@/components/episodes/processing-status";

describe("ProcessingStatus", () => {
  it("renders nothing when status is null", () => {
    const { container } = render(<ProcessingStatus status={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when status is undefined", () => {
    const { container } = render(<ProcessingStatus status={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Queued badge for queued status", () => {
    render(<ProcessingStatus status="queued" />);
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });

  it("renders Transcribing badge for running status", () => {
    render(<ProcessingStatus status="running" />);
    expect(screen.getByText("Transcribing...")).toBeInTheDocument();
  });

  it("renders Transcribing badge for transcribing status", () => {
    render(<ProcessingStatus status="transcribing" />);
    expect(screen.getByText("Transcribing...")).toBeInTheDocument();
  });

  it("renders Summarizing badge for summarizing status", () => {
    render(<ProcessingStatus status="summarizing" />);
    expect(screen.getByText("Summarizing...")).toBeInTheDocument();
  });

  it("renders Summarized badge for completed status", () => {
    render(<ProcessingStatus status="completed" />);
    expect(screen.getByText("Summarized")).toBeInTheDocument();
  });

  it("renders Failed badge for failed status", () => {
    render(<ProcessingStatus status="failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("passes className prop through", () => {
    render(<ProcessingStatus status="completed" className="text-xs" />);
    const badge = screen.getByText("Summarized").closest("[class]");
    expect(badge?.className).toContain("text-xs");
  });
});
