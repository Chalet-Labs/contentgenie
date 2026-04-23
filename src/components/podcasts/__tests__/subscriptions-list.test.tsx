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
  // Child card pulls unsubscribeFromPodcast via SubscribeButton → also mocked here.
  subscribeToPodcast: vi.fn().mockResolvedValue({ success: true }),
  unsubscribeFromPodcast: vi.fn().mockResolvedValue({ success: true }),
}));

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
  }: {
    value: string;
    onValueChange: (next: string) => void;
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <select
      data-testid="sort-select"
      value={value}
      onChange={(e) => onValueChange(e.currentTarget.value)}
    >
      {children}
    </select>
  );
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
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

  it("persists the new sort when the dropdown changes", async () => {
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

  it("optimistically flips the pin state when the pin button is clicked", async () => {
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
  });

  it("reverts the optimistic pin state and toasts when togglePinSubscription fails", async () => {
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
    // Reverted to unpinned label.
    expect(
      screen.getByRole("button", { name: "Pin podcast" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
