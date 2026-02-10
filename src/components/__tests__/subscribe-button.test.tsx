import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubscribeButton } from "@/components/podcasts/subscribe-button";

vi.mock("@/app/actions/subscriptions", () => ({
  subscribeToPodcast: vi.fn(),
  unsubscribeFromPodcast: vi.fn(),
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

  it("calls subscribeToPodcast on click", async () => {
    const { subscribeToPodcast } = await import("@/app/actions/subscriptions");
    vi.mocked(subscribeToPodcast).mockResolvedValue({
      success: true,
      message: "Subscribed",
    });

    const user = userEvent.setup();
    render(<SubscribeButton {...defaultProps} />);

    await user.click(screen.getByRole("button"));
    expect(subscribeToPodcast).toHaveBeenCalled();
  });

  it("calls unsubscribeFromPodcast when already subscribed", async () => {
    const { unsubscribeFromPodcast } = await import(
      "@/app/actions/subscriptions"
    );
    vi.mocked(unsubscribeFromPodcast).mockResolvedValue({
      success: true,
      message: "Unsubscribed",
    });

    const user = userEvent.setup();
    render(<SubscribeButton {...defaultProps} initialSubscribed={true} />);

    await user.click(screen.getByRole("button"));
    expect(unsubscribeFromPodcast).toHaveBeenCalledWith("123");
  });
});
