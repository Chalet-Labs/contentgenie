import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubscribeButton } from "@/components/podcasts/subscribe-button";

vi.mock("@/lib/offline-actions", () => ({
  offlineSubscribe: vi.fn(),
  offlineUnsubscribe: vi.fn(),
}));

vi.mock("@/hooks/use-sync-queue", () => ({
  useSyncQueue: () => ({ hasPending: () => false }),
}));

vi.mock("@/hooks/use-online-status", () => ({
  useOnlineStatus: () => true,
}));

const defaultProps = {
  podcastIndexId: "123",
  title: "Test Podcast",
  initialSubscribed: false,
};

describe("SubscribeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("renders 'Subscribe' when not subscribed", () => {
    render(<SubscribeButton {...defaultProps} />);
    expect(screen.getByText("Subscribe")).toBeInTheDocument();
  });

  it("renders 'Subscribed' when initially subscribed", () => {
    render(<SubscribeButton {...defaultProps} initialSubscribed={true} />);
    expect(screen.getByText("Subscribed")).toBeInTheDocument();
  });

  it("calls offlineSubscribe on click", async () => {
    const { offlineSubscribe } = await import("@/lib/offline-actions");
    vi.mocked(offlineSubscribe).mockResolvedValue({
      success: true,
      message: "Subscribed",
    });

    const user = userEvent.setup();
    render(<SubscribeButton {...defaultProps} />);

    await user.click(screen.getByRole("button"));
    expect(offlineSubscribe).toHaveBeenCalled();
  });

  it("calls offlineUnsubscribe when already subscribed", async () => {
    const { offlineUnsubscribe } = await import("@/lib/offline-actions");
    vi.mocked(offlineUnsubscribe).mockResolvedValue({
      success: true,
      message: "Unsubscribed",
    });

    const user = userEvent.setup();
    render(<SubscribeButton {...defaultProps} initialSubscribed={true} />);

    await user.click(screen.getByRole("button"));
    expect(offlineUnsubscribe).toHaveBeenCalledWith("123", true);
  });
});
