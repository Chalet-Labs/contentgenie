import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock useRealtimeRun
const mockUseRealtimeRun = vi.fn().mockReturnValue({ run: null });
vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: (...args: unknown[]) => mockUseRealtimeRun(...args),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock server actions
const mockGetUserSubscriptions = vi.fn().mockResolvedValue({
  subscriptions: [
    { podcast: { id: 1, title: "Podcast One" } },
    { podcast: { id: 2, title: "Podcast Two" } },
  ],
});
const mockGetResummarizeEpisodeCount = vi.fn().mockResolvedValue({ count: 10 });

vi.mock("@/app/actions/subscriptions", () => ({
  getUserSubscriptions: (...args: unknown[]) => mockGetUserSubscriptions(...args),
}));

vi.mock("@/app/actions/bulk-resummarize", () => ({
  getResummarizeEpisodeCount: (...args: unknown[]) =>
    mockGetResummarizeEpisodeCount(...args),
}));

// Mock fetch globally
const mockFetch = vi.fn();

// Mock trigger type (only used for useRealtimeRun type inference)
vi.mock("@/trigger/bulk-resummarize", () => ({}));

import { BulkResummarizeCard } from "@/components/settings/bulk-resummarize-card";

describe("BulkResummarizeCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockUseRealtimeRun.mockReturnValue({ run: null });
    mockGetUserSubscriptions.mockResolvedValue({
      subscriptions: [
        { podcast: { id: 1, title: "Podcast One" } },
        { podcast: { id: 2, title: "Podcast Two" } },
      ],
    });
    mockGetResummarizeEpisodeCount.mockResolvedValue({ count: 10 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the card with title and Re-Summarize button", async () => {
    render(<BulkResummarizeCard />);

    expect(screen.getByText("AI Summaries")).toBeInTheDocument();
    expect(screen.getByText("Re-generate AI summaries for your episodes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Re-Summarize/i })).toBeInTheDocument();
  });

  it("Re-Summarize button is disabled when no filter is selected", async () => {
    render(<BulkResummarizeCard />);

    const button = screen.getByRole("button", { name: /Re-Summarize/i });
    expect(button).toBeDisabled();
  });

  it("Re-Summarize button becomes enabled when 'Re-summarize all episodes' is checked", async () => {
    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    const checkbox = screen.getByLabelText("Re-summarize all episodes");
    await user.click(checkbox);

    expect(screen.getByRole("button", { name: /Re-Summarize/i })).toBeEnabled();
  });

  it("checking 'Re-summarize all episodes' clears other filter fields", async () => {
    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    // Set a maxScore value first
    const maxScoreInput = screen.getByPlaceholderText(/re-summarize low scores/i);
    await user.type(maxScoreInput, "5");
    expect(maxScoreInput).toHaveValue(5);

    // Now check the "all" checkbox
    const checkbox = screen.getByLabelText("Re-summarize all episodes");
    await user.click(checkbox);

    // maxScore should be cleared
    expect(maxScoreInput).toHaveValue(null);
  });

  it("shows confirmation dialog when Re-Summarize is clicked with a filter", async () => {
    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    // Check "all episodes"
    await user.click(screen.getByLabelText("Re-summarize all episodes"));

    // Click Re-Summarize
    await user.click(screen.getByRole("button", { name: /Re-Summarize/i }));

    // Wait for count estimate and dialog
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  it("confirmation dialog shows 'ALL episodes' warning when all checkbox is checked", async () => {
    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    await user.click(screen.getByLabelText("Re-summarize all episodes"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize/i }));

    await waitFor(() => {
      expect(screen.getByText(/Re-summarize ALL episodes\?/i)).toBeInTheDocument();
    });
  });

  it("confirmation dialog shows episode count from server action", async () => {
    mockGetResummarizeEpisodeCount.mockResolvedValue({ count: 42 });
    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    await user.click(screen.getByLabelText("Re-summarize all episodes"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize/i }));

    await waitFor(() => {
      // The confirm button includes the count
      expect(screen.getByRole("button", { name: /Re-Summarize 42 episodes/i })).toBeInTheDocument();
    });
  });

  it("does NOT open dialog and shows toast when count is 0", async () => {
    mockGetResummarizeEpisodeCount.mockResolvedValue({ count: 0 });
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    await user.click(screen.getByLabelText("Re-summarize all episodes"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize/i }));

    await waitFor(() => {
      expect(vi.mocked(toast.info)).toHaveBeenCalledWith(
        "No episodes match the selected filters"
      );
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows error when no filter and no 'all' checkbox — button stays disabled", async () => {
    render(<BulkResummarizeCard />);

    // Button should be disabled, can't click
    expect(screen.getByRole("button", { name: /Re-Summarize/i })).toBeDisabled();
    expect(mockGetResummarizeEpisodeCount).not.toHaveBeenCalled();
  });

  it("enters processing state after confirming", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          runId: "run_test",
          publicAccessToken: "tok_test",
          estimatedEpisodes: 10,
        }),
    });

    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    await user.click(screen.getByLabelText("Re-summarize all episodes"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize/i }));

    // Confirm dialog appears
    await waitFor(() => {
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    // Click confirm
    await user.click(screen.getByRole("button", { name: /Re-Summarize 10 episodes/i }));

    // Progress UI appears
    await waitFor(() => {
      expect(screen.getByText(/0 of 10 completed/i)).toBeInTheDocument();
    });
  });

  it("subscribes to realtime run after confirm", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          runId: "run_realtime",
          publicAccessToken: "tok_realtime",
          estimatedEpisodes: 5,
        }),
    });

    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    await user.click(screen.getByLabelText("Re-summarize all episodes"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize/i }));

    await waitFor(() => screen.getByRole("alertdialog"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize 10 episodes/i }));

    await waitFor(() => {
      expect(mockUseRealtimeRun).toHaveBeenCalledWith("run_realtime", {
        accessToken: "tok_realtime",
        enabled: true,
      });
    });
  });

  it("shows error state on API failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Invalid filter" }),
    });

    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    await user.click(screen.getByLabelText("Re-summarize all episodes"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize/i }));

    await waitFor(() => screen.getByRole("alertdialog"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize 10 episodes/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid filter")).toBeInTheDocument();
    });
  });

  it("shows rate limit error when 429 received", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: "Rate limit exceeded" }),
    });

    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    await user.click(screen.getByLabelText("Re-summarize all episodes"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize/i }));

    await waitFor(() => screen.getByRole("alertdialog"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize 10 episodes/i }));

    await waitFor(() => {
      expect(screen.getByText(/Rate limit exceeded/i)).toBeInTheDocument();
    });
  });

  it("Clear button resets to idle state from error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "API error" }),
    });

    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    await user.click(screen.getByLabelText("Re-summarize all episodes"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize/i }));

    await waitFor(() => screen.getByRole("alertdialog"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize 10 episodes/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Re-Summarize/i })).toBeInTheDocument();
    });
  });

  it("shows done state when run completes successfully", async () => {
    const { toast } = await import("sonner");
    render(<BulkResummarizeCard />);

    // Simulate a completed run via useRealtimeRun
    mockUseRealtimeRun.mockReturnValue({
      run: {
        status: "COMPLETED",
        output: { total: 10, succeeded: 9, failed: 1 },
        metadata: null,
      },
    });

    // Re-render to trigger the effect
    const { rerender } = render(<BulkResummarizeCard />);
    rerender(<BulkResummarizeCard />);

    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
        "Bulk re-summarization complete"
      );
    });
  });

  it("shows cancel button during processing", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          runId: "run_cancel_test",
          publicAccessToken: "tok",
          estimatedEpisodes: 10,
        }),
    });

    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    await user.click(screen.getByLabelText("Re-summarize all episodes"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize/i }));

    await waitFor(() => screen.getByRole("alertdialog"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize 10 episodes/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });
  });

  it("calls DELETE endpoint when cancel is clicked during processing", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: () =>
          Promise.resolve({
            runId: "run_to_cancel",
            publicAccessToken: "tok",
            estimatedEpisodes: 5,
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ canceled: true }),
      });

    const user = userEvent.setup();
    render(<BulkResummarizeCard />);

    await user.click(screen.getByLabelText("Re-summarize all episodes"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize/i }));

    await waitFor(() => screen.getByRole("alertdialog"));
    await user.click(screen.getByRole("button", { name: /Re-Summarize 10 episodes/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/bulk-resummarize",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ runId: "run_to_cancel" }),
        })
      );
    });
  });
});
