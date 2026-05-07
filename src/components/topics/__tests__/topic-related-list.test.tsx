import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopicRelatedList } from "@/components/topics/topic-related-list";
import type { RelatedTopic } from "@/app/actions/topics";

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

function makeItems(n: number): RelatedTopic[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    label: `Related ${i + 1}`,
    kind: "concept" as const,
  }));
}

describe("TopicRelatedList", () => {
  it("renders 5 chips when given 5 items", () => {
    render(<TopicRelatedList items={makeItems(5)} />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("renders fewer chips when given fewer items", () => {
    render(<TopicRelatedList items={makeItems(2)} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("returns null (renders nothing) when items is empty", () => {
    const { container } = render(<TopicRelatedList items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("each chip links to /topic/<id>", () => {
    render(<TopicRelatedList items={makeItems(3)} />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/topic/1");
    expect(links[1]).toHaveAttribute("href", "/topic/2");
    expect(links[2]).toHaveAttribute("href", "/topic/3");
  });

  it("all expected chip labels render as links", () => {
    const items = makeItems(5);
    render(<TopicRelatedList items={items} />);
    for (const item of items) {
      expect(
        screen.getByRole("link", { name: new RegExp(item.label, "i") }),
      ).toBeInTheDocument();
    }
  });

  it("uses an aria-labelled section for the related-topics group", () => {
    render(<TopicRelatedList items={makeItems(1)} />);
    expect(
      screen.getByRole("region", { name: /related topics/i }),
    ).toBeInTheDocument();
  });
});
