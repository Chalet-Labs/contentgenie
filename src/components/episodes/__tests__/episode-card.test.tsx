import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpisodeCard } from "@/components/episodes/episode-card";
import type { CanonicalOverlapResult } from "@/lib/topic-overlap";

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
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
    tabIndex?: number;
    "aria-hidden"?: boolean | "true" | "false";
  }) => (
    <a
      href={href}
      className={className}
      onClick={onClick}
      tabIndex={tabIndex}
      aria-hidden={ariaHidden}
    >
      {children}
    </a>
  ),
}));

const baseProps = {
  podcastTitle: "Tech Talk Daily",
  title: "How AI is Transforming Podcast Discovery",
  href: "/episode/PI-42",
  meta: [<span key="time">2 hours ago</span>],
};

describe("EpisodeCard", () => {
  it("renders title and podcast title", () => {
    render(<EpisodeCard {...baseProps} />);
    expect(
      screen.getByText("How AI is Transforming Podcast Discovery"),
    ).toBeInTheDocument();
    expect(screen.getByText("Tech Talk Daily")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<EpisodeCard {...baseProps} description="An episode about AI" />);
    expect(screen.getByText("An episode about AI")).toBeInTheDocument();
  });

  it("does not render description when omitted", () => {
    render(<EpisodeCard {...baseProps} />);
    expect(screen.queryByText("An episode about AI")).not.toBeInTheDocument();
  });

  it("renders up to 3 topic chips and caps extras", () => {
    render(
      <EpisodeCard {...baseProps} topics={["AI", "Tech", "Future", "Extra"]} />,
    );
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("Tech")).toBeInTheDocument();
    expect(screen.getByText("Future")).toBeInTheDocument();
    expect(screen.queryByText("Extra")).not.toBeInTheDocument();
  });

  it("renders score pill when score is non-null", () => {
    render(<EpisodeCard {...baseProps} score="7.50" />);
    expect(screen.getByText(/7\.5/)).toBeInTheDocument();
  });

  it("renders 'Not rated' badge when score is null", () => {
    render(<EpisodeCard {...baseProps} score={null} />);
    expect(screen.getByText(/not rated/i)).toBeInTheDocument();
  });

  it("renders 'Not rated' badge when score is an empty string", () => {
    render(<EpisodeCard {...baseProps} score="" />);
    expect(screen.getByText(/not rated/i)).toBeInTheDocument();
  });

  it("does not render any score badge when score prop is omitted", () => {
    render(<EpisodeCard {...baseProps} />);
    expect(screen.queryByText(/\d+\.\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/not rated/i)).not.toBeInTheDocument();
  });

  it("renders spinner icon for status=running", () => {
    render(<EpisodeCard {...baseProps} status="running" />);
    expect(screen.getByLabelText("Processing")).toBeInTheDocument();
  });

  it("renders spinner icon for status=queued", () => {
    render(<EpisodeCard {...baseProps} status="queued" />);
    expect(screen.getByLabelText("Processing")).toBeInTheDocument();
  });

  it("renders spinner icon for status=summarizing", () => {
    render(<EpisodeCard {...baseProps} status="summarizing" />);
    expect(screen.getByLabelText("Processing")).toBeInTheDocument();
  });

  it("renders alert icon for status=failed", () => {
    render(<EpisodeCard {...baseProps} status="failed" />);
    expect(screen.getByLabelText("Summary failed")).toBeInTheDocument();
  });

  it("renders no status icon for status=completed", () => {
    render(<EpisodeCard {...baseProps} status="completed" />);
    expect(screen.queryByLabelText("Processing")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Summary failed")).not.toBeInTheDocument();
  });

  it("renders no status icon when status is omitted", () => {
    render(<EpisodeCard {...baseProps} />);
    expect(screen.queryByLabelText("Processing")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Summary failed")).not.toBeInTheDocument();
  });

  it("exposes data-status='completed' for completed-state styling hooks", () => {
    const { container } = render(
      <EpisodeCard {...baseProps} status="completed" />,
    );
    expect(container.firstChild).toHaveAttribute("data-status", "completed");
  });

  it("exposes data-status for non-completed statuses", () => {
    const { container } = render(
      <EpisodeCard {...baseProps} status="running" />,
    );
    expect(container.firstChild).toHaveAttribute("data-status", "running");
  });

  it("wraps podcastTitle in a Link when podcastHref is provided", () => {
    const { container } = render(
      <EpisodeCard {...baseProps} podcastHref="/podcast/PI-99?from=library" />,
    );
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="/podcast/PI-99?from=library"]',
    );
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("Tech Talk Daily");
  });

  it("renders podcastTitle as plain text when podcastHref is omitted", () => {
    const { container } = render(<EpisodeCard {...baseProps} />);
    const podcastLink = container.querySelector('a[href^="/podcast/"]');
    expect(podcastLink).toBeNull();
    expect(screen.getByText("Tech Talk Daily").tagName).toBe("P");
  });

  it("renders artwork image when artwork string is provided", () => {
    const { container } = render(
      <EpisodeCard {...baseProps} artwork="https://example.com/art.jpg" />,
    );
    // Artwork Link is aria-hidden, so role-based queries skip it; query by tag.
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://example.com/art.jpg");
  });

  it("renders Rss fallback when artwork is null", () => {
    const { container } = render(<EpisodeCard {...baseProps} artwork={null} />);
    // Artwork column rendered but no <img> — Rss icon fills the tile
    expect(container.querySelector("img")).toBeNull();
    // Link wrapping the artwork tile is present
    const artworkLink = container.querySelector('a[href="/episode/PI-42"]');
    expect(artworkLink).toBeInTheDocument();
  });

  it("omits the artwork column entirely when artwork is undefined", () => {
    const { container } = render(<EpisodeCard {...baseProps} />);
    // No img and no artwork-wrapping link
    expect(container.querySelector("img")).toBeNull();
    // The only link present should be the title link (h3 inside it)
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
  });

  it("exposes data-accent='unread' for accent=unread", () => {
    const { container } = render(
      <EpisodeCard {...baseProps} accent="unread" />,
    );
    expect(container.firstChild).toHaveAttribute("data-accent", "unread");
  });

  it("exposes data-accent='none' for accent=none (default)", () => {
    const { container } = render(<EpisodeCard {...baseProps} />);
    expect(container.firstChild).toHaveAttribute("data-accent", "none");
  });

  it("sets data-listened attribute from isListened prop", () => {
    const { container } = render(
      <EpisodeCard {...baseProps} isListened={true} />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute("data-listened", "true");
  });

  it("renders primaryAction slot", () => {
    render(
      <EpisodeCard {...baseProps} primaryAction={<button>Listen</button>} />,
    );
    expect(screen.getByRole("button", { name: "Listen" })).toBeInTheDocument();
  });

  it("renders secondaryActions slot", () => {
    render(
      <EpisodeCard
        {...baseProps}
        secondaryActions={<button aria-label="Dismiss">X</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("uses href on the title link", () => {
    const { container } = render(<EpisodeCard {...baseProps} />);
    const links = container.querySelectorAll("a");
    const hrefs = Array.from(links).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/episode/PI-42");
  });

  it("renders title without a Link when href is omitted", () => {
    const { container } = render(
      <EpisodeCard
        {...baseProps}
        href={undefined}
        artwork="https://example.com/art.jpg"
      />,
    );
    // With href undefined, both the title Link and ArtworkTile's Link drop out —
    // the card should contain zero anchors. Asserting absence-by-count is
    // stronger than probing for a never-set aria-label.
    expect(container.querySelectorAll("a")).toHaveLength(0);
    const titleNode = screen.getByText(
      "How AI is Transforming Podcast Discovery",
    );
    expect(titleNode.tagName).toBe("H3");
    expect(titleNode.closest("a")).toBeNull();
  });

  it("renders meta nodes", () => {
    render(
      <EpisodeCard {...baseProps} meta={[<span key="t">2 hours ago</span>]} />,
    );
    expect(screen.getByText("2 hours ago")).toBeInTheDocument();
  });

  describe("listen-state accent bar", () => {
    it("applies listen-state accent bar when isListened is false (default)", () => {
      const { container } = render(<EpisodeCard {...baseProps} />);
      expect(
        (container.firstChild as HTMLElement).classList.contains(
          "border-l-primary",
        ),
      ).toBe(true);
    });

    it("omits listen-state accent bar when isListened is true", () => {
      const { container } = render(
        <EpisodeCard {...baseProps} isListened={true} />,
      );
      expect(
        (container.firstChild as HTMLElement).classList.contains(
          "border-l-primary",
        ),
      ).toBe(false);
    });

    it("does not apply accent bar for completed status when episode is listened", () => {
      const { container } = render(
        <EpisodeCard {...baseProps} status="completed" isListened={true} />,
      );
      expect(
        (container.firstChild as HTMLElement).classList.contains(
          "border-l-primary",
        ),
      ).toBe(false);
    });

    it("applies accent bar for completed status when unlistened (driven by listen state, not status)", () => {
      const { container } = render(
        <EpisodeCard {...baseProps} status="completed" />,
      );
      expect(
        (container.firstChild as HTMLElement).classList.contains(
          "border-l-primary",
        ),
      ).toBe(true);
    });
  });

  it("fires onTitleClick when the title link is clicked", async () => {
    const onTitleClick = vi.fn();
    const user = userEvent.setup();
    render(<EpisodeCard {...baseProps} onTitleClick={onTitleClick} />);
    await user.click(
      screen.getByText("How AI is Transforming Podcast Discovery"),
    );
    expect(onTitleClick).toHaveBeenCalledTimes(1);
  });

  it("fires onTitleClick when the artwork link is clicked", async () => {
    const onTitleClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <EpisodeCard
        {...baseProps}
        artwork="https://example.com/art.jpg"
        onTitleClick={onTitleClick}
      />,
    );
    const artworkLink = container.querySelector<HTMLAnchorElement>(
      'a[href="/episode/PI-42"][aria-hidden="true"]',
    );
    expect(artworkLink).not.toBeNull();
    await user.click(artworkLink!);
    expect(onTitleClick).toHaveBeenCalledTimes(1);
  });

  it("marks the artwork link as aria-hidden to avoid duplicate screen-reader announcements", () => {
    const { container } = render(
      <EpisodeCard {...baseProps} artwork="https://example.com/art.jpg" />,
    );
    const artworkLink = container.querySelector<HTMLAnchorElement>(
      'a[href="/episode/PI-42"][aria-hidden="true"]',
    );
    expect(artworkLink).not.toBeNull();
    expect(artworkLink).toHaveAttribute("tabindex", "-1");
  });

  describe("overlap indicator", () => {
    const repeatOverlap: CanonicalOverlapResult = {
      kind: "repeat",
      count: 3,
      topicLabel: "creatine",
      topicId: 1,
    };

    it("renders canonical repeat indicator when canonicalOverlap is set", () => {
      render(<EpisodeCard {...baseProps} canonicalOverlap={repeatOverlap} />);
      const indicator = screen.getByTestId("overlap-indicator");
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveTextContent(
        "You've heard 3 episodes on creatine",
      );
      expect(indicator).toHaveAttribute(
        "data-canonical-overlap-kind",
        "repeat",
      );
    });

    it("renders category fallback when canonicalOverlap is null and categoryOverlap has a label", () => {
      render(
        <EpisodeCard
          {...baseProps}
          canonicalOverlap={null}
          categoryOverlap={{
            label: "You've heard 5 similar episodes",
            labelKind: "high-overlap",
          }}
        />,
      );
      const indicator = screen.getByTestId("overlap-indicator");
      expect(indicator).toHaveTextContent("You've heard 5 similar episodes");
      expect(indicator).not.toHaveAttribute("data-canonical-overlap-kind");
    });

    it("renders no indicator when canonicalOverlap is null and categoryOverlap label is null", () => {
      render(
        <EpisodeCard
          {...baseProps}
          canonicalOverlap={null}
          categoryOverlap={{ label: null, labelKind: null }}
        />,
      );
      expect(screen.queryByTestId("overlap-indicator")).not.toBeInTheDocument();
    });

    it("renders only canonical indicator when both canonicalOverlap and categoryOverlap are set (canonical precedence)", () => {
      render(
        <EpisodeCard
          {...baseProps}
          canonicalOverlap={repeatOverlap}
          categoryOverlap={{
            label: "You've heard 5 similar episodes",
            labelKind: "high-overlap",
          }}
        />,
      );
      const indicators = screen.getAllByTestId("overlap-indicator");
      expect(indicators).toHaveLength(1);
      expect(indicators[0]).toHaveAttribute(
        "data-canonical-overlap-kind",
        "repeat",
      );
    });
  });
});
