import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EpisodeCard } from "@/components/episodes/episode-card";
import type { CanonicalTopicChip } from "@/db/library-columns";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    onClick,
    tabIndex,
    "aria-hidden": ariaHidden,
    "aria-label": ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    tabIndex?: number;
    "aria-hidden"?: boolean | "true" | "false";
    "aria-label"?: string;
  }) => (
    <a
      href={href}
      className={className}
      onClick={onClick}
      tabIndex={tabIndex}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  ),
}));

const baseProps = {
  podcastTitle: "Tech Talk Daily",
  title: "Deep Dive into LLMs",
  href: "/episode/PI-100",
  meta: [<span key="time">1 hour ago</span>],
};

const sampleChips: CanonicalTopicChip[] = [
  { id: 1, label: "Creatine", kind: "concept" },
  { id: 2, label: "AI Safety", kind: "regulation" },
  { id: 3, label: "GPU shortage", kind: "incident" },
  { id: 4, label: "Google I/O", kind: "event" },
  { id: 5, label: "GPT-5 deal", kind: "deal" },
];

describe("EpisodeCard (primitive) — canonical topics", () => {
  it("renders no chip row when canonicalTopics is undefined", () => {
    render(<EpisodeCard {...baseProps} />);
    expect(
      screen.queryByRole("link", { name: /^Topic:/i }),
    ).not.toBeInTheDocument();
  });

  it("renders no chip row when canonicalTopics is an empty array", () => {
    render(<EpisodeCard {...baseProps} canonicalTopics={[]} />);
    expect(
      screen.queryByRole("link", { name: /^Topic:/i }),
    ).not.toBeInTheDocument();
  });

  it("renders exactly 3 chips when 5 are supplied (cap enforced)", () => {
    render(<EpisodeCard {...baseProps} canonicalTopics={sampleChips} />);
    const chips = screen.getAllByRole("link", { name: /^Topic:/i });
    expect(chips).toHaveLength(3);
  });

  it("chip aria-labels include the kind", () => {
    render(<EpisodeCard {...baseProps} canonicalTopics={sampleChips} />);
    const chips = screen.getAllByRole("link", { name: /^Topic:/i });
    // First chip should be Creatine — kind: concept
    expect(chips[0]).toHaveAttribute("aria-label", "Topic: Creatine — concept");
  });

  it("chip row coexists with the string-topics row when both supplied", () => {
    render(
      <EpisodeCard
        {...baseProps}
        topics={["AI", "Machine Learning"]}
        canonicalTopics={sampleChips.slice(0, 2)}
      />,
    );
    // String topic badges
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    // Canonical chip links
    expect(screen.getAllByRole("link", { name: /^Topic:/i })).toHaveLength(2);
  });

  it("canonical chip row appears after the string-topics row in DOM order", () => {
    render(
      <EpisodeCard
        {...baseProps}
        topics={["AI"]}
        canonicalTopics={[{ id: 1, label: "Creatine", kind: "concept" }]}
      />,
    );
    const aiText = screen.getByText("AI");
    const chipLink = screen.getByRole("link", { name: /^Topic:/i });

    // compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING = 4
    const position = aiText.compareDocumentPosition(chipLink);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
