import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubscriptionCard } from "@/components/podcasts/subscription-card";
import { unsubscribeFromPodcast } from "@/app/actions/subscriptions";
import type { Podcast } from "@/db/schema";

vi.mock("@/app/actions/subscriptions", () => ({
  subscribeToPodcast: vi.fn().mockResolvedValue({ success: true }),
  unsubscribeFromPodcast: vi.fn().mockResolvedValue({ success: true }),
}));

const mockPodcast: Podcast = {
  id: 1,
  podcastIndexId: "12345",
  title: "Test Podcast",
  description: "A great podcast about testing",
  publisher: "Test Publisher",
  imageUrl: "https://example.com/image.jpg",
  rssFeedUrl: "https://example.com/feed.xml",
  categories: ["Technology", "Science", "Education", "Health"],
  totalEpisodes: 42,
  latestEpisodeDate: new Date("2026-02-10"),
  source: "podcastindex",
  lastPolledAt: null,
  createdAt: new Date("2025-06-01"),
  updatedAt: new Date("2026-02-10"),
};

const subscribedAt = new Date("2026-01-15");

describe("SubscriptionCard", () => {
  it("renders as a link to the podcast detail page", () => {
    render(
      <SubscriptionCard podcast={mockPodcast} subscribedAt={subscribedAt} />
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/podcast/12345?from=subscriptions"
    );
  });

  it("renders only one link wrapping the card", () => {
    render(
      <SubscriptionCard podcast={mockPodcast} subscribedAt={subscribedAt} />
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
  });

  it("renders the podcast title", () => {
    render(
      <SubscriptionCard podcast={mockPodcast} subscribedAt={subscribedAt} />
    );
    expect(screen.getByText("Test Podcast")).toBeInTheDocument();
  });

  it("renders the publisher name", () => {
    render(
      <SubscriptionCard podcast={mockPodcast} subscribedAt={subscribedAt} />
    );
    expect(screen.getByText("Test Publisher")).toBeInTheDocument();
  });

  it("renders up to 3 categories", () => {
    render(
      <SubscriptionCard podcast={mockPodcast} subscribedAt={subscribedAt} />
    );
    expect(screen.getByText("Technology")).toBeInTheDocument();
    expect(screen.getByText("Science")).toBeInTheDocument();
    expect(screen.getByText("Education")).toBeInTheDocument();
    expect(screen.queryByText("Health")).not.toBeInTheDocument();
  });

  it("renders the subscribed date", () => {
    render(
      <SubscriptionCard podcast={mockPodcast} subscribedAt={subscribedAt} />
    );
    expect(screen.getByText(/Subscribed\s+Jan 15/)).toBeInTheDocument();
  });

  it("renders episode count", () => {
    render(
      <SubscriptionCard podcast={mockPodcast} subscribedAt={subscribedAt} />
    );
    expect(screen.getByText("42 episodes")).toBeInTheDocument();
  });

  it("clicking subscribe button does not propagate to parent link", () => {
    const parentClickHandler = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
      <div onClick={parentClickHandler}>
        <SubscriptionCard podcast={mockPodcast} subscribedAt={subscribedAt} />
      </div>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(parentClickHandler).not.toHaveBeenCalled();
  });

  it("clicking subscribe button triggers the subscription action", () => {
    render(
      <SubscriptionCard podcast={mockPodcast} subscribedAt={subscribedAt} />
    );
    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(unsubscribeFromPodcast).toHaveBeenCalledWith("12345");
  });

  it("stops event propagation on button container", () => {
    render(
      <SubscriptionCard podcast={mockPodcast} subscribedAt={subscribedAt} />
    );
    const button = screen.getByRole("button");
    // The button's parent div has onClick and onKeyDown handlers
    const buttonContainer = button.closest(
      "[class*='relative z-10']"
    ) as HTMLElement;

    // Test click event
    const clickEvent = new MouseEvent("click", { bubbles: true });
    const stopPropagationSpyClick = vi.spyOn(clickEvent, "stopPropagation");
    fireEvent(buttonContainer, clickEvent);
    expect(stopPropagationSpyClick).toHaveBeenCalled();

    // Test keydown event (Enter key)
    const keydownEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
    });
    const stopPropagationSpyKeydown = vi.spyOn(
      keydownEvent,
      "stopPropagation"
    );
    fireEvent(buttonContainer, keydownEvent);
    expect(stopPropagationSpyKeydown).toHaveBeenCalled();
  });
});
