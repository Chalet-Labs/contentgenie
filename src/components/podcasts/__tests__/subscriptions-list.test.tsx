import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { SubscriptionsList } from "@/components/podcasts/subscriptions-list";
import {
  setSubscriptionSort,
  togglePinSubscription,
  type SubscriptionWithPodcast,
} from "@/app/actions/subscriptions";

vi.mock("@/app/actions/subscriptions", () => ({
  setSubscriptionSort: vi.fn(),
  togglePinSubscription: vi.fn(),
  // SubscribeButton → @/lib/offline-actions → these server actions. Stubbing
  // the action module short-circuits the whole chain so the child card renders
  // without pulling a real DB call.
  subscribeToPodcast: vi.fn().mockResolvedValue({ success: true }),
  unsubscribeFromPodcast: vi.fn().mockResolvedValue({ success: true }),
}));

// Stable `router.refresh` spy — `src/test/setup.ts` returns a fresh vi.fn()
// per call, so we override `useRouter` locally to capture calls across renders.
const routerRefreshMock = vi.fn();
vi.mock("next/navigation", async () => {
  const actual =
    await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    useRouter: () => ({
      refresh: routerRefreshMock,
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

vi.mock("@/hooks/use-sync-queue", () => ({
  useSyncQueue: () => ({ hasPending: () => false, hasFailed: () => false }),
}));

vi.mock("@/hooks/use-online-status", () => ({
  useOnlineStatus: () => true,
}));

// Replace the shadcn/Radix Select with a native <select> so sort changes are
// testable in jsdom without wrestling the Radix portal.
vi.mock("@/components/ui/select", () => {
  const Select = ({
    value,
    onValueChange,
    children,
    disabled,
  }: {
    value: string;
    onValueChange: (next: string) => void;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <select
      data-testid="sort-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.currentTarget.value)}
    >
      {children}
    </select>
  );
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  );
  const SelectItem = ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>;

  return {
    Select,
    SelectTrigger: Passthrough,
    SelectValue: Passthrough,
    SelectContent: Passthrough,
    SelectItem,
  };
});

const makeSub = (
  id: number,
  overrides: Partial<SubscriptionWithPodcast> = {},
): SubscriptionWithPodcast => ({
  id,
  userId: "user_test",
  podcastId: id,
  subscribedAt: new Date("2026-01-15"),
  notificationsEnabled: true,
  isPinned: false,
  podcast: {
    id,
    podcastIndexId: String(10_000 + id),
    title: `Podcast ${id}`,
    publisher: "Example",
    imageUrl: null,
    rssFeedUrl: null,
    categories: [],
    totalEpisodes: 10,
    latestEpisodeDate: new Date("2026-02-10"),
    source: "podcastindex",
    lastPolledAt: null,
    createdAt: new Date("2025-06-01"),
    updatedAt: new Date("2026-02-10"),
  },
  ...overrides,
});

const setSubscriptionSortMock = vi.mocked(setSubscriptionSort);
const togglePinSubscriptionMock = vi.mocked(togglePinSubscription);
const toastError = vi.mocked(toast.error);

describe("SubscriptionsList", () => {
  beforeEach(() => {
    setSubscriptionSortMock.mockReset();
    togglePinSubscriptionMock.mockReset();
    toastError.mockReset();
    routerRefreshMock.mockReset();
  });

  it("renders one card per subscription", () => {
    render(
      <SubscriptionsList
        subscriptions={[makeSub(1), makeSub(2)]}
        initialSort="recently-added"
      />,
    );
    expect(screen.getByText("Podcast 1")).toBeInTheDocument();
    expect(screen.getByText("Podcast 2")).toBeInTheDocument();
  });

  it("persists the new sort and refreshes the route on success", async () => {
    setSubscriptionSortMock.mockResolvedValue({ success: true });
    render(
      <SubscriptionsList
        subscriptions={[makeSub(1)]}
        initialSort="recently-added"
      />,
    );
    fireEvent.change(screen.getByTestId("sort-select"), {
      target: { value: "title-asc" },
    });
    await waitFor(() => {
      expect(setSubscriptionSortMock).toHaveBeenCalledExactlyOnceWith(
        "title-asc",
      );
    });
    await waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it("rolls back the dropdown and toasts when setSubscriptionSort rejects", async () => {
    setSubscriptionSortMock.mockRejectedValue(new Error("network"));
    render(
      <SubscriptionsList
        subscriptions={[makeSub(1)]}
        initialSort="recently-added"
      />,
    );
    const select = screen.getByTestId("sort-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "latest-episode" } });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(select.value).toBe("recently-added");
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });

  it("rolls back the dropdown and toasts when setSubscriptionSort fails", async () => {
    setSubscriptionSortMock.mockResolvedValue({
      success: false,
      error: "nope",
    });
    render(
      <SubscriptionsList
        subscriptions={[makeSub(1)]}
        initialSort="recently-added"
      />,
    );
    const select = screen.getByTestId("sort-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "latest-episode" } });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("nope");
    });
    expect(select.value).toBe("recently-added");
  });

  it("optimistically flips the pin state and refreshes the route on success", async () => {
    togglePinSubscriptionMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ success: true, data: { isPinned: true } }),
            0,
          ),
        ),
    );
    render(
      <SubscriptionsList
        subscriptions={[makeSub(1, { isPinned: false })]}
        initialSort="recently-added"
      />,
    );
    const pinButton = screen.getByRole("button", { name: "Pin podcast" });
    fireEvent.click(pinButton);
    // Optimistic: label and aria-pressed flip synchronously, before the action resolves.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Unpin podcast" }),
      ).toHaveAttribute("aria-pressed", "true");
    });
    await waitFor(() => {
      expect(togglePinSubscriptionMock).toHaveBeenCalledExactlyOnceWith(1);
    });
    // Server confirmed → route refreshed so RSC props catch up.
    await waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it("reconciles the override against the refreshed `subscription.isPinned` prop", async () => {
    togglePinSubscriptionMock.mockResolvedValue({
      success: true,
      data: { isPinned: true },
    });
    const { rerender } = render(
      <SubscriptionsList
        subscriptions={[makeSub(1, { isPinned: false })]}
        initialSort="recently-added"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pin podcast" }));
    await waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    });
    // Simulate the refreshed RSC payload arriving with the server's new truth.
    rerender(
      <SubscriptionsList
        subscriptions={[makeSub(1, { isPinned: true })]}
        initialSort="recently-added"
      />,
    );
    // Override is reconciled, prop wins — displayed state tracks the server.
    expect(
      screen.getByRole("button", { name: "Unpin podcast" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("reverts the optimistic pin state and toasts when togglePinSubscription returns {success:false}", async () => {
    togglePinSubscriptionMock.mockResolvedValue({
      success: false,
      error: "pin failed",
    });
    render(
      <SubscriptionsList
        subscriptions={[makeSub(1, { isPinned: false })]}
        initialSort="recently-added"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pin podcast" }));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("pin failed");
    });
    expect(screen.getByRole("button", { name: "Pin podcast" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });

  it("reverts the optimistic pin state and toasts when togglePinSubscription rejects", async () => {
    togglePinSubscriptionMock.mockRejectedValue(new Error("network"));
    render(
      <SubscriptionsList
        subscriptions={[makeSub(1, { isPinned: false })]}
        initialSort="recently-added"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pin podcast" }));
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(screen.getByRole("button", { name: "Pin podcast" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });
});
