import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopicChip } from "@/components/episodes/topic-chip";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-label": ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-label"?: string;
  }) => (
    <a href={href} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

// Mock SynthesizeButton to a sentinel so chip tests don't need navigation/action mocks
vi.mock("@/components/episodes/synthesize-button", () => ({
  SynthesizeButton: ({
    canonicalTopicId,
    label,
  }: {
    canonicalTopicId: number;
    label: string;
  }) => (
    <button
      type="button"
      aria-label={`Synthesize digest for ${label}`}
      data-testid={`synthesize-btn-${canonicalTopicId}`}
    >
      Synthesize
    </button>
  ),
}));

// Mock MIN_DERIVED_COUNT_FOR_DIGEST via the thresholds module (real value = 3)
vi.mock("@/lib/topic-digest-thresholds", () => ({
  MIN_DERIVED_COUNT_FOR_DIGEST: 3,
  STALENESS_GROWTH_THRESHOLD: 3,
  RELATED_TOPICS_LIMIT: 5,
}));

describe("TopicChip", () => {
  const defaultProps = {
    canonicalTopicId: 42,
    label: "Claude Opus 4.7 release",
    kind: "release" as const,
  };

  it("renders a link with the correct href", () => {
    render(<TopicChip {...defaultProps} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/topic/42");
  });

  it("renders the label text", () => {
    render(<TopicChip {...defaultProps} />);
    expect(screen.getByText("Claude Opus 4.7 release")).toBeInTheDocument();
  });

  it("has aria-label matching Topic: {label} — {kind}", () => {
    render(<TopicChip {...defaultProps} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "aria-label",
      "Topic: Claude Opus 4.7 release — release",
    );
  });

  it("renders an icon with aria-hidden", () => {
    render(<TopicChip {...defaultProps} />);
    const icon = document.querySelector("svg[aria-hidden='true']");
    expect(icon).toBeInTheDocument();
  });

  it("forwards className to the link element", () => {
    render(<TopicChip {...defaultProps} className="my-custom-class" />);
    const link = screen.getByRole("link");
    expect(link.className).toContain("my-custom-class");
  });

  it("applies opacity-60 when status is dormant", () => {
    render(<TopicChip {...defaultProps} status="dormant" />);
    const link = screen.getByRole("link");
    expect(link.className).toContain("opacity-60");
  });

  it("does not apply opacity-60 when status is active", () => {
    render(<TopicChip {...defaultProps} status="active" />);
    const link = screen.getByRole("link");
    expect(link.className).not.toContain("opacity-60");
  });

  it("renders incident kind with text-destructive icon color", () => {
    render(
      <TopicChip canonicalTopicId={1} label="API outage" kind="incident" />,
    );
    const icon = document.querySelector("svg[aria-hidden='true']");
    expect(icon?.getAttribute("class")).toContain("text-destructive");
  });

  it("renders concept kind with text-violet-500 icon color", () => {
    render(
      <TopicChip
        canonicalTopicId={2}
        label="Attention mechanism"
        kind="concept"
      />,
    );
    const icon = document.querySelector("svg[aria-hidden='true']");
    expect(icon?.getAttribute("class")).toContain("text-violet-500");
  });

  it("renders other kind with text-muted-foreground icon color", () => {
    render(
      <TopicChip canonicalTopicId={3} label="Miscellaneous" kind="other" />,
    );
    const icon = document.querySelector("svg[aria-hidden='true']");
    expect(icon?.getAttribute("class")).toContain("text-muted-foreground");
  });
});

describe("TopicChip — synthesize variant", () => {
  const defaultProps = {
    canonicalTopicId: 42,
    label: "Claude Opus 4.7 release",
    kind: "release" as const,
  };

  // ── Gate passes: synthesizable=true + episodeCount >= 3 ─────────────────

  it("renders synthesize button when synthesizable=true and episodeCount=3", () => {
    render(
      <TopicChip {...defaultProps} synthesizable={true} episodeCount={3} />,
    );
    const button = screen.getByRole("button", {
      name: /synthesize digest for/i,
    });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute(
      "aria-label",
      "Synthesize digest for Claude Opus 4.7 release",
    );
  });

  it("renders synthesize button when synthesizable=true and episodeCount > 3", () => {
    render(
      <TopicChip {...defaultProps} synthesizable={true} episodeCount={10} />,
    );
    expect(
      screen.getByRole("button", { name: /synthesize digest for/i }),
    ).toBeInTheDocument();
  });

  // ── Gate fails: episodeCount < MIN_DERIVED_COUNT_FOR_DIGEST ─────────────

  it("no button when synthesizable=true but episodeCount=2 (below threshold)", () => {
    render(
      <TopicChip {...defaultProps} synthesizable={true} episodeCount={2} />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // ── Gate fails: synthesizable=false ─────────────────────────────────────

  it("no button when synthesizable=false even with high episodeCount", () => {
    render(
      <TopicChip {...defaultProps} synthesizable={false} episodeCount={10} />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // ── Base case: no new props → original rendering unchanged ───────────────

  it("base case (no new props): renders single link, no wrapper span, no button", () => {
    const { container } = render(<TopicChip {...defaultProps} />);
    // Link still rendered
    expect(screen.getByRole("link")).toBeInTheDocument();
    // No button
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    // No wrapper span (chip renders as Link directly)
    expect(container.querySelector("span.inline-flex")).not.toBeInTheDocument();
  });

  // ── Wrapper span present when synthesize gate passes ─────────────────────

  it("wraps in inline-flex span when synthesize gate passes", () => {
    const { container } = render(
      <TopicChip {...defaultProps} synthesizable={true} episodeCount={5} />,
    );
    const wrapper = container.querySelector("span.inline-flex");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass("items-center", "gap-0.5");
    // Both link and button inside wrapper
    expect(wrapper?.querySelector("a")).toBeInTheDocument();
    expect(wrapper?.querySelector("button")).toBeInTheDocument();
  });
});
