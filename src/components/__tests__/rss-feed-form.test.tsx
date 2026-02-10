import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RssFeedForm } from "@/components/podcasts/rss-feed-form";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock sonner
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock server action
const mockAddPodcastByRssUrl = vi.fn();
vi.mock("@/app/actions/subscriptions", () => ({
  addPodcastByRssUrl: (...args: unknown[]) => mockAddPodcastByRssUrl(...args),
}));

describe("RssFeedForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("renders the input and button", () => {
    render(<RssFeedForm />);

    expect(
      screen.getByPlaceholderText("Paste RSS feed URL..."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Feed" }),
    ).toBeInTheDocument();
  });

  it("disables the button when input is empty", () => {
    render(<RssFeedForm />);

    expect(screen.getByRole("button", { name: "Add Feed" })).toBeDisabled();
  });

  it("enables the button when input has a URL", async () => {
    const user = userEvent.setup();
    render(<RssFeedForm />);

    await user.type(
      screen.getByPlaceholderText("Paste RSS feed URL..."),
      "https://example.com/feed.xml",
    );

    expect(screen.getByRole("button", { name: "Add Feed" })).toBeEnabled();
  });

  it("shows toast error for invalid URL on submit", async () => {
    const user = userEvent.setup();
    render(<RssFeedForm />);

    await user.type(
      screen.getByPlaceholderText("Paste RSS feed URL..."),
      "not-a-url",
    );
    await user.click(screen.getByRole("button", { name: "Add Feed" }));

    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringMatching(/valid URL/i),
    );
    expect(mockAddPodcastByRssUrl).not.toHaveBeenCalled();
  });

  it("calls the server action with the URL on valid submit", async () => {
    const user = userEvent.setup();
    mockAddPodcastByRssUrl.mockResolvedValue({
      success: true,
      title: "Test Podcast",
      podcastIndexId: "rss-abc123",
      episodeCount: 5,
    });

    render(<RssFeedForm />);

    await user.type(
      screen.getByPlaceholderText("Paste RSS feed URL..."),
      "https://example.com/feed.xml",
    );
    await user.click(screen.getByRole("button", { name: "Add Feed" }));

    expect(mockAddPodcastByRssUrl).toHaveBeenCalledWith(
      "https://example.com/feed.xml",
    );
  });
});
