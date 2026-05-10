import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// ─── Mock next/link ──────────────────────────────────────────────────────────

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

// ─── Mock getRecentTopicDigests ───────────────────────────────────────────────

const mockGetRecentTopicDigests = vi.fn();
vi.mock("@/app/actions/topics", () => ({
  getRecentTopicDigests: (...args: unknown[]) =>
    mockGetRecentTopicDigests(...args),
}));

// ─── Import component under test ──────────────────────────────────────────────

import { TopicDigestList } from "@/components/dashboard/topic-digest-list";

// ─── Fixture factory ──────────────────────────────────────────────────────────

function makeDigest(
  overrides: Partial<{
    canonicalId: number;
    label: string;
    kind: string;
    episodeCount: number;
    generatedAt: Date;
    consensusPreview: string;
  }> = {},
) {
  return {
    canonicalId: overrides.canonicalId ?? 1,
    label: overrides.label ?? "AI Ethics",
    kind: overrides.kind ?? "concept",
    episodeCount: overrides.episodeCount ?? 5,
    generatedAt: overrides.generatedAt ?? new Date("2026-05-08T10:00:00Z"),
    consensusPreview:
      overrides.consensusPreview ?? "AI ethics is increasingly important.",
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TopicDigestList", () => {
  // ── Populated: renders card with rows ────────────────────────────────────────

  it("populated: renders a card with digest rows", async () => {
    const digests = [
      makeDigest({
        canonicalId: 10,
        label: "GDPR Update",
        kind: "regulation",
        episodeCount: 4,
        consensusPreview: "New privacy rules incoming.",
      }),
      makeDigest({
        canonicalId: 20,
        label: "AI Act",
        kind: "regulation",
        episodeCount: 7,
        consensusPreview: "EU AI Act framework released.",
      }),
    ];
    mockGetRecentTopicDigests.mockResolvedValue({
      success: true,
      data: digests,
    });

    const element = await TopicDigestList();
    expect(element).not.toBeNull();
    const { container } = render(element!);

    // Card title is present
    expect(container.textContent).toContain("This week's takes");
    // Both digest labels are present
    expect(container.textContent).toContain("GDPR Update");
    expect(container.textContent).toContain("AI Act");
    // Links point to correct topic URLs
    const links = container.querySelectorAll('a[href^="/topic/"]');
    const hrefs = Array.from(links).map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/topic/10");
    expect(hrefs).toContain("/topic/20");
    // Episode counts visible
    expect(container.textContent).toContain("4 episodes");
    expect(container.textContent).toContain("7 episodes");
    // Consensus previews visible
    expect(container.textContent).toContain("New privacy rules incoming.");
    expect(container.textContent).toContain("EU AI Act framework released.");
    // Kind badges visible
    expect(container.textContent).toContain("regulation");
    // Description mentions count + last 7 days (plural form for 2 rows)
    expect(container.textContent).toContain("2 digests");
    expect(container.textContent).not.toContain("2 digest ");
    expect(container.textContent).toContain("last 7 days");
  });

  // ── Empty array → returns null ─────────────────────────────────────────────

  it("empty array: component returns null (nothing rendered)", async () => {
    mockGetRecentTopicDigests.mockResolvedValue({ success: true, data: [] });

    const element = await TopicDigestList();
    expect(element).toBeNull();
  });

  // ── Error → returns null + console.error called ────────────────────────────

  it("error: component returns null and logs error", async () => {
    mockGetRecentTopicDigests.mockResolvedValue({
      success: false,
      error: "Unauthorized",
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const element = await TopicDigestList();
    expect(element).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[TopicDigestList]",
      "Unauthorized",
    );
    consoleSpy.mockRestore();
  });

  // ── Single row: renders correctly ─────────────────────────────────────────

  it("single row: description shows singular count", async () => {
    const digests = [makeDigest({ canonicalId: 5, label: "OpenAI Drama" })];
    mockGetRecentTopicDigests.mockResolvedValue({
      success: true,
      data: digests,
    });

    const element = await TopicDigestList();
    expect(element).not.toBeNull();
    const { container } = render(element!);
    // Singular form when count === 1
    expect(container.textContent).toContain("1 digest ");
    expect(container.textContent).not.toContain("1 digests");
    expect(container.textContent).toContain("OpenAI Drama");
  });

  // ── Each row has chevron affordance ─────────────────────────────────────────

  it("each row has an svg chevron icon", async () => {
    const digests = [makeDigest()];
    mockGetRecentTopicDigests.mockResolvedValue({
      success: true,
      data: digests,
    });

    const element = await TopicDigestList();
    expect(element).not.toBeNull();
    const { container } = render(element!);
    // ChevronRight SVG rendered as aria-hidden
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });
});
