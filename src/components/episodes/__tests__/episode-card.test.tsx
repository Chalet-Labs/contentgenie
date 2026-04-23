import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EpisodeCard } from "@/components/episodes/episode-card";

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
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
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
      screen.getByText("How AI is Transforming Podcast Discovery")
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
      <EpisodeCard {...baseProps} topics={["AI", "Tech", "Future", "Extra"]} />
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
      <EpisodeCard {...baseProps} status="completed" />
    );
    expect(container.firstChild).toHaveAttribute("data-status", "completed");
  });

  it("exposes data-status for non-completed statuses", () => {
    const { container } = render(
      <EpisodeCard {...baseProps} status="running" />
    );
    expect(container.firstChild).toHaveAttribute("data-status", "running");
  });

  it("wraps podcastTitle in a Link when podcastHref is provided", () => {
    const { container } = render(
      <EpisodeCard
        {...baseProps}
        podcastHref="/podcast/PI-99?from=library"
      />
    );
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="/podcast/PI-99?from=library"]'
    );
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("Tech Talk Daily");
  });

  it("renders podcastTitle as plain text when podcastHref is omitted", () => {
    const { container } = render(<EpisodeCard {...baseProps} />);
    const podcastLink = container.querySelector(
      'a[href^="/podcast/"]'
    );
    expect(podcastLink).toBeNull();
    expect(screen.getByText("Tech Talk Daily").tagName).toBe("P");
  });

  it("renders artwork image when artwork string is provided", () => {
    render(
      <EpisodeCard {...baseProps} artwork="https://example.com/art.jpg" />
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://example.com/art.jpg"
    );
  });

  it("renders Rss fallback when artwork is null", () => {
    const { container } = render(<EpisodeCard {...baseProps} artwork={null} />);
    // artwork column is rendered (not omitted), but no img — Rss icon fills the tile
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // Link wrapping the artwork tile is present
    const artworkLink = container.querySelector('a[href="/episode/PI-42"]');
    expect(artworkLink).toBeInTheDocument();
  });

  it("omits the artwork column entirely when artwork is undefined", () => {
    const { container } = render(<EpisodeCard {...baseProps} />);
    // No img and no artwork-wrapping link
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // The only link present should be the title link (h3 inside it)
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
  });

  it("exposes data-accent='unread' for accent=unread", () => {
    const { container } = render(
      <EpisodeCard {...baseProps} accent="unread" />
    );
    expect(container.firstChild).toHaveAttribute("data-accent", "unread");
  });

  it("exposes data-accent='none' for accent=none (default)", () => {
    const { container } = render(<EpisodeCard {...baseProps} />);
    expect(container.firstChild).toHaveAttribute("data-accent", "none");
  });

  it("sets data-listened attribute from isListened prop", () => {
    const { container } = render(
      <EpisodeCard {...baseProps} isListened={true} />
    );
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute("data-listened", "true");
  });

  it("renders primaryAction slot", () => {
    render(
      <EpisodeCard
        {...baseProps}
        primaryAction={<button>Listen</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Listen" })).toBeInTheDocument();
  });

  it("renders secondaryActions slot", () => {
    render(
      <EpisodeCard
        {...baseProps}
        secondaryActions={<button aria-label="Dismiss">X</button>}
      />
    );
    expect(
      screen.getByRole("button", { name: "Dismiss" })
    ).toBeInTheDocument();
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
      />
    );
    const titleLink = container.querySelector<HTMLAnchorElement>(
      'a[aria-label^="Open episode"]'
    );
    expect(titleLink).toBeNull();
    expect(
      screen.getByText("How AI is Transforming Podcast Discovery").tagName
    ).toBe("H3");
  });

  it("renders meta nodes", () => {
    render(<EpisodeCard {...baseProps} meta={[<span key="t">2 hours ago</span>]} />);
    expect(screen.getByText("2 hours ago")).toBeInTheDocument();
  });
});
