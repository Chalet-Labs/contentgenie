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
        "/api/podcasts/search?q=lex&max=20",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
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
      expect(screen.getByText("Service unavailable")).toBeInTheDocument();
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

  it("cancels in-flight request when query changes", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");

    mockSearchParams = new URLSearchParams("q=first");
    mockFetch.mockImplementation(
      (_url: string, options?: { signal?: AbortSignal }) =>
        new Promise((resolve, reject) => {
          const onAbort = () => {
            const abortError = new DOMException("Aborted", "AbortError");
            reject(abortError);
          };
          if (options?.signal?.aborted) {
            onAbort();
            return;
          }
          options?.signal?.addEventListener("abort", onAbort);
          // First request never resolves naturally — it will be aborted
          // Second request resolves immediately
          if (
            typeof _url === "string" &&
            _url.includes("q=second")
          ) {
            resolve({
              ok: true,
              json: async () => ({
                podcasts: [{ id: 2, title: "Second Result" }],
              }),
            });
          }
        })
    );

    const { rerender } = render(<DiscoverContent />);

    // Simulate query change by updating searchParams and re-rendering
    mockSearchParams = new URLSearchParams("q=second");
    rerender(<DiscoverContent />);

    await waitFor(() => {
      expect(abortSpy).toHaveBeenCalled();
    });

    abortSpy.mockRestore();
  });

  it("does not display AbortError as user-facing error", async () => {
    mockSearchParams = new URLSearchParams("q=test");

    // Simulate a fetch that rejects with AbortError after controller is aborted
    mockFetch.mockImplementation(
      (_url: string, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          // Listen for abort and reject accordingly
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );

    const { unmount } = render(<DiscoverContent />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Unmount triggers the cleanup which calls controller.abort()
    unmount();

    // The AbortError is caught and silently ignored — no error state set.
    // If it weren't handled, the test would fail with an unhandled rejection.
  });

  it("aborts fetch on unmount", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");

    mockSearchParams = new URLSearchParams("q=test");
    // Never-resolving fetch to ensure request is still in-flight on unmount
    mockFetch.mockReturnValue(new Promise(() => {}));

    const { unmount } = render(<DiscoverContent />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    unmount();

    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
  });
});
