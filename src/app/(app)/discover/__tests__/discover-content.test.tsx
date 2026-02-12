import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiscoverContent } from "../discover-content";

// Mock next/navigation with controllable searchParams
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/discover",
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("DiscoverContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ podcasts: [] }),
    });
  });

  it("renders with empty state when no URL params", () => {
    render(<DiscoverContent />);

    expect(
      screen.getByPlaceholderText("Search podcasts...")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });

  it("auto-fetches when URL has q param", async () => {
    mockSearchParams = new URLSearchParams("q=lex");
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        podcasts: [
          {
            id: 1,
            title: "Lex Fridman Podcast",
            author: "Lex Fridman",
            image: "",
            description: "Test",
            url: "https://example.com",
            categories: {},
          },
        ],
      }),
    });

    render(<DiscoverContent />);

    expect(screen.getByDisplayValue("lex")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/podcasts/search?q=lex&max=20"
      );
    });
  });

  it("updates URL on search submission", async () => {
    const user = userEvent.setup();
    render(<DiscoverContent />);

    await user.type(
      screen.getByPlaceholderText("Search podcasts..."),
      "technology"
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(mockReplace).toHaveBeenCalledWith(
      "/discover?q=technology"
    );
  });

  it("strips URL params when submitting empty query", async () => {
    const user = userEvent.setup();
    mockSearchParams = new URLSearchParams("q=something");
    render(<DiscoverContent />);

    await user.clear(screen.getByPlaceholderText("Search podcasts..."));
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(mockReplace).toHaveBeenCalledWith("/discover");
  });

  it("displays error when fetch fails", async () => {
    mockSearchParams = new URLSearchParams("q=failing");
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Service unavailable" }),
    });

    render(<DiscoverContent />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  it("trims whitespace from query before updating URL", async () => {
    const user = userEvent.setup();
    render(<DiscoverContent />);

    await user.type(
      screen.getByPlaceholderText("Search podcasts..."),
      "  lex fridman  "
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(mockReplace).toHaveBeenCalledWith(
      "/discover?q=lex%20fridman"
    );
  });

  it("does not fetch when URL has no q param", () => {
    render(<DiscoverContent />);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
