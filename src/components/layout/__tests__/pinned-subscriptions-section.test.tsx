import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PinnedSubscriptionsSection } from "@/components/layout/pinned-subscriptions-section";
import { Sheet as SheetWrapper } from "@/components/ui/sheet";

const mockUsePinnedSubscriptionsOptional = vi.fn();
const mockUsePathname = vi.fn(() => "/");

vi.mock("@/contexts/pinned-subscriptions-context", () => ({
  usePinnedSubscriptionsOptional: () => mockUsePinnedSubscriptionsOptional(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/ui/sheet", async () => {
  const { createSheetMock } =
    await vi.importActual<typeof import("@/test/mocks/sheet")>(
      "@/test/mocks/sheet",
    );
  return createSheetMock();
});

const PINS = [
  {
    id: 1,
    podcastId: 10,
    podcastIndexId: "pod-1",
    title: "Alpha Podcast",
    imageUrl: null,
  },
  {
    id: 2,
    podcastId: 20,
    podcastIndexId: "pod-2",
    title: "Beta Podcast",
    imageUrl: "https://example.com/beta.jpg",
  },
];

beforeEach(() => {
  mockUsePinnedSubscriptionsOptional.mockReturnValue({
    pinned: [],
    isLoading: false,
    refreshPins: vi.fn(),
  });
  mockUsePathname.mockReturnValue("/");
});

describe("PinnedSubscriptionsSection — empty state", () => {
  it("renders nothing when pinned is empty", () => {
    const { container } = render(
      <PinnedSubscriptionsSection inSheet={false} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("PinnedSubscriptionsSection — populated state", () => {
  beforeEach(() => {
    mockUsePinnedSubscriptionsOptional.mockReturnValue({
      pinned: PINS,
      isLoading: false,
      refreshPins: vi.fn(),
    });
  });

  it("renders one link per pinned entry in provided order", () => {
    render(<PinnedSubscriptionsSection inSheet={false} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/podcast/pod-1");
    expect(links[1]).toHaveAttribute("href", "/podcast/pod-2");
  });

  it("renders img when imageUrl is a string", () => {
    render(<PinnedSubscriptionsSection inSheet={false} />);

    // img with empty alt is presentation role, use querySelector
    const img = document.querySelector("img");
    expect(img).toBeTruthy();
    expect(img).toHaveAttribute("src", "https://example.com/beta.jpg");
  });

  it("renders Rss fallback icon when imageUrl is null", () => {
    render(<PinnedSubscriptionsSection inSheet={false} />);

    const fallback = screen.getAllByTestId("pinned-rss-fallback");
    expect(fallback.length).toBe(1); // only Alpha has null imageUrl
  });

  it("applies active-state classes when pathname matches", () => {
    mockUsePathname.mockReturnValue("/podcast/pod-1");
    render(<PinnedSubscriptionsSection inSheet={false} />);

    const alphaLink = screen.getByRole("link", { name: /alpha podcast/i });
    expect(alphaLink.classList.contains("bg-accent")).toBe(true);
    expect(alphaLink.classList.contains("text-accent-foreground")).toBe(true);
  });

  it("does not apply active-state classes when pathname does not match", () => {
    mockUsePathname.mockReturnValue("/");
    render(<PinnedSubscriptionsSection inSheet={false} />);

    const alphaLink = screen.getByRole("link", { name: /alpha podcast/i });
    // classList only contains individual class tokens, not "hover:bg-accent"
    expect(alphaLink.classList.contains("bg-accent")).toBe(false);
  });

  it("title span has truncate class", () => {
    render(<PinnedSubscriptionsSection inSheet={false} />);

    const spans = screen.getAllByText(/alpha podcast|beta podcast/i);
    for (const span of spans) {
      expect(span.className).toContain("truncate");
    }
  });

  it("wraps each link in SheetClose when inSheet=true", () => {
    render(
      <SheetWrapper>
        <PinnedSubscriptionsSection inSheet={true} />
      </SheetWrapper>,
    );

    // MaybeSheetClose uses SheetClose asChild, which clones the Link element.
    // Verify links still render correctly inside the Sheet context.
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
  });
});
