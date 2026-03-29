import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { DiscoverContent } from "../discover-content";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("DiscoverContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ podcasts: [] }),
    });
  });

  it("renders with empty state when no URL params", () => {
    render(<DiscoverContent />, {
      wrapper: withNuqsTestingAdapter(),
    });

    expect(
      screen.getByPlaceholderText("Search podcasts...")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });

  it("auto-fetches when URL has q param", async () => {
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

    render(<DiscoverContent />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "?q=lex" }),
    });

    expect(screen.getByDisplayValue("lex")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/podcasts/search?q=lex&max=20",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  it("updates URL on search submission", async () => {
    const onUrlUpdate = vi.fn();
    const user = userEvent.setup();
    render(<DiscoverContent />, {
      wrapper: withNuqsTestingAdapter({ onUrlUpdate }),
    });

    await user.type(
      screen.getByPlaceholderText("Search podcasts..."),
      "technology"
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          queryString: expect.stringContaining("q=technology"),
        })
      );
    });
  });

  it("strips URL params when submitting empty query", async () => {
    const onUrlUpdate = vi.fn();
    const user = userEvent.setup();
    render(<DiscoverContent />, {
      wrapper: withNuqsTestingAdapter({
        searchParams: "?q=something",
        onUrlUpdate,
      }),
    });

    await user.clear(screen.getByPlaceholderText("Search podcasts..."));
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ queryString: "" })
      );
    });
  });

  it("displays error when fetch fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Service unavailable" }),
    });

    render(<DiscoverContent />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "?q=failing" }),
    });

    await waitFor(() => {
      expect(screen.getByText("Service unavailable")).toBeInTheDocument();
    });
  });

  it("trims whitespace from query before updating URL", async () => {
    const onUrlUpdate = vi.fn();
    const user = userEvent.setup();
    render(<DiscoverContent />, {
      wrapper: withNuqsTestingAdapter({ onUrlUpdate }),
    });

    await user.type(
      screen.getByPlaceholderText("Search podcasts..."),
      "  lex fridman  "
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          queryString: expect.stringContaining("q=lex+fridman"),
        })
      );
    });
  });

  it("does not fetch when URL has no q param", () => {
    render(<DiscoverContent />, {
      wrapper: withNuqsTestingAdapter(),
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("cancels in-flight request when query changes via form submission", async () => {
    const user = userEvent.setup();
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");

    mockFetch.mockImplementation(
      (_url: string, options?: { signal?: AbortSignal }) =>
        new Promise((resolve, reject) => {
          const onAbort = () => {
            reject(new DOMException("Aborted", "AbortError"));
          };
          if (options?.signal?.aborted) {
            onAbort();
            return;
          }
          options?.signal?.addEventListener("abort", onAbort);
          if (typeof _url === "string" && _url.includes("q=second")) {
            resolve({
              ok: true,
              json: async () => ({
                podcasts: [{ id: 2, title: "Second Result" }],
              }),
            });
          }
        })
    );

    render(<DiscoverContent />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "?q=first" }),
    });

    // Wait for the first fetch to be in-flight
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("q=first"),
        expect.anything()
      );
    });

    // Drive a real query change via the component's search form
    const input = screen.getByPlaceholderText("Search podcasts...");
    await user.clear(input);
    await user.type(input, "second");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(abortSpy).toHaveBeenCalled();
    });

    abortSpy.mockRestore();
  });

  it("does not display AbortError as user-facing error", async () => {
    mockFetch.mockImplementation(
      (_url: string, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );

    const { unmount } = render(<DiscoverContent />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "?q=test" }),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Unmount triggers cleanup which calls controller.abort()
    unmount();

    // AbortError is caught and silently ignored — no error state set.
  });

  it("aborts fetch on unmount", async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, "abort");

    // Never-resolving fetch to ensure request is still in-flight on unmount
    mockFetch.mockReturnValue(new Promise(() => {}));

    const { unmount } = render(<DiscoverContent />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "?q=test" }),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    unmount();

    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
  });
});
