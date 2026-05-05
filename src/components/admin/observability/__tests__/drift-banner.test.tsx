import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DriftBanner } from "@/components/admin/observability/drift-banner";
import type { DriftResult } from "@/lib/observability/resolution-metrics";

const rates = { auto: 0.72, disambig: 0.18, new: 0.1, total: 500 };

function makeResult(
  status: DriftResult["status"],
  reason = "test reason",
): DriftResult {
  return { status, reason, rates };
}

describe("DriftBanner", () => {
  it("renders 'OK:' label and reason for ok status", () => {
    render(
      <DriftBanner
        result={makeResult("ok", "All metrics within healthy bounds")}
      />,
    );
    expect(screen.getByText(/OK:/)).toBeInTheDocument();
    expect(
      screen.getByText(/All metrics within healthy bounds/),
    ).toBeInTheDocument();
  });

  it("renders 'Warning:' label and reason for warn status", () => {
    render(<DriftBanner result={makeResult("warn", "auto-match rate low")} />);
    expect(screen.getByText(/Warning:/)).toBeInTheDocument();
    expect(screen.getByText(/auto-match rate low/)).toBeInTheDocument();
  });

  it("renders 'Alert:' label and reason for alert status", () => {
    render(<DriftBanner result={makeResult("alert", "rate below floor")} />);
    expect(screen.getByText(/Alert:/)).toBeInTheDocument();
    expect(screen.getByText(/rate below floor/)).toBeInTheDocument();
  });

  it("applies green container class for ok status", () => {
    const { container } = render(<DriftBanner result={makeResult("ok")} />);
    const banner = container.firstElementChild!;
    expect(banner.className).toMatch(/bg-green-50/);
  });

  it("applies amber container class for warn status", () => {
    const { container } = render(<DriftBanner result={makeResult("warn")} />);
    const banner = container.firstElementChild!;
    expect(banner.className).toMatch(/bg-amber-50/);
  });

  it("applies red container class for alert status", () => {
    const { container } = render(<DriftBanner result={makeResult("alert")} />);
    const banner = container.firstElementChild!;
    expect(banner.className).toMatch(/bg-red-50/);
  });

  it("sets data-status attribute matching the status", () => {
    const { container } = render(<DriftBanner result={makeResult("warn")} />);
    expect(container.firstElementChild!.getAttribute("data-status")).toBe(
      "warn",
    );
  });

  it("renders rate breakdown sub-line when rates.total > 0", () => {
    render(<DriftBanner result={makeResult("ok")} />);
    // rates = { auto: 0.72, disambig: 0.18, new: 0.1, total: 500 }
    expect(screen.getByText(/auto 72%/)).toBeInTheDocument();
    expect(screen.getByText(/llm_disambig 18%/)).toBeInTheDocument();
    expect(screen.getByText(/new 10%/)).toBeInTheDocument();
    expect(screen.getByText(/n=500/)).toBeInTheDocument();
  });

  it("hides rate breakdown sub-line when rates.total === 0", () => {
    const zeroRates = { auto: 0, disambig: 0, new: 0, total: 0 };
    render(
      <DriftBanner
        result={{ status: "ok", reason: "empty window", rates: zeroRates }}
      />,
    );
    expect(screen.queryByText(/auto 0%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/n=0/)).not.toBeInTheDocument();
  });
});
