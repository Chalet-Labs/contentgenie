import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const { clerkState } = vi.hoisted(() => ({
  clerkState: { signedIn: false },
}));

vi.mock("@clerk/nextjs", async () => {
  const { createClerkMock } = await vi.importActual<
    typeof import("@/test/mocks/clerk-nextjs")
  >("@/test/mocks/clerk-nextjs");
  return createClerkMock(clerkState);
});

import { Hero } from "@/components/landing/hero";
import { HeroSurface } from "@/components/landing/hero-surface";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ExampleSummary } from "@/components/landing/example-summary";
import { Pricing } from "@/components/landing/pricing";
import { FinalCta } from "@/components/landing/final-cta";
import { JoinBetaButton } from "@/components/landing/join-beta-button";

beforeEach(() => {
  clerkState.signedIn = false;
});

describe("Hero", () => {
  it("renders headline, subhead, and CTAs", () => {
    render(<Hero />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /triage the podcasts/i,
    );
    expect(screen.getByText(/now in public beta/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /join the beta/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /see a real summary/i }),
    ).toHaveAttribute("href", "#example");
  });
});

describe("HeroSurface", () => {
  it("renders the inbox mock with derived score labels", () => {
    render(<HeroSurface />);
    expect(screen.getByText(/today's queue/i)).toBeInTheDocument();
    expect(screen.getAllByText(/exceptional/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/above average/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^skip$/i)).toBeInTheDocument();
  });
});

describe("Features", () => {
  it("renders all four feature cells with canonical score labels", () => {
    render(<Features />);
    expect(
      screen.getByRole("heading", { name: /worth-it score/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /key takeaways/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /library that remembers/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /discover, cross-indexed/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/above avg\b/i)).not.toBeInTheDocument();
  });
});

describe("HowItWorks", () => {
  it("renders all four steps in order", () => {
    render(<HowItWorks />);
    expect(screen.getByText(/paste a feed/i)).toBeInTheDocument();
    const steps = screen
      .getAllByText(/^STEP\.0[1-4]$/)
      .map((el) => el.textContent);
    expect(steps).toEqual(["STEP.01", "STEP.02", "STEP.03", "STEP.04"]);
  });
});

describe("ExampleSummary", () => {
  it("renders the worked-example summary card with verdict + takeaways", () => {
    render(<ExampleSummary />);
    expect(screen.getByText(/what a summary looks like/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^verdict$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^key takeaways$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^worth it for$/i }),
    ).toBeInTheDocument();
  });
});

describe("Pricing", () => {
  it("renders the beta-free card with $0 and promise stats", () => {
    render(<Pricing />);
    expect(screen.getByText(/free while we're in beta/i)).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(
      screen.getByText(/public beta · limited seats/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /claim your seat — free/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/716/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1,284/)).not.toBeInTheDocument();
  });
});

describe("FinalCta", () => {
  it("renders the closing CTA without stale seat counts", () => {
    render(<FinalCta />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /join the beta/i,
    );
    expect(
      screen.getByRole("button", { name: /claim your seat/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/716 seats/i)).not.toBeInTheDocument();
  });
});

describe("JoinBetaButton — signed out", () => {
  it("renders the signed-out SignUp button with default label and arrow", () => {
    render(<JoinBetaButton />);
    expect(
      screen.getByRole("button", { name: /join the beta/i }),
    ).toBeInTheDocument();
  });

  it("accepts a custom label and arrow suppression", () => {
    render(<JoinBetaButton label="Claim your seat" withArrow={false} />);
    expect(
      screen.getByRole("button", { name: /claim your seat/i }),
    ).toBeInTheDocument();
  });
});

describe("JoinBetaButton — signed in", () => {
  it("renders a link to /dashboard instead of the SignUp button", () => {
    clerkState.signedIn = true;
    render(<JoinBetaButton />);
    const link = screen.getByRole("link", { name: /join the beta/i });
    expect(link).toHaveAttribute("href", "/dashboard");
    expect(
      screen.queryByRole("button", { name: /join the beta/i }),
    ).not.toBeInTheDocument();
  });
});
