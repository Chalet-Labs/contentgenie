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
