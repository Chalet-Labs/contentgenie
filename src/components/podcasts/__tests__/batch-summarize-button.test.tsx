import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BatchSummarizeButton } from "@/components/podcasts/batch-summarize-button";
import { realtimeRunFixture } from "@/test/realtime-run";

const mocks = vi.hoisted(() => ({
  useRealtimeRun: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: (...args: unknown[]) => mocks.useRealtimeRun(...args),
}));

vi.mock("sonner", () => ({
  toast: mocks.toast,
}));

const mockFetch = vi.fn();

describe("BatchSummarizeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mocks.useRealtimeRun.mockReturnValue({ run: null });
  });

  it("sanitizes ids, starts realtime tracking, and renders the completed summary", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          runId: "run_123",
          publicAccessToken: "tok_abc",
          total: 3,
          skipped: 1,
        }),
    });

    mocks.useRealtimeRun.mockImplementation(
      (runId: string, options: { enabled: boolean; accessToken: string }) => {
        if (runId !== "run_123" || !options.enabled) {
          return { run: null };
        }

        return {
          run: realtimeRunFixture("COMPLETED", {
            metadata: {
              progress: {
                total: 3,
                succeeded: 2,
                failed: 0,
                skipped: 1,
                completed: 3,
              },
            },
          }),
        };
      },
    );

    render(<BatchSummarizeButton episodeIds={[1, "2", "bad", -3, "0"]} />);

    await user.click(screen.getByRole("button", { name: /summarize recent/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm summarizing 2 episodes/i }),
    );

    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        "Batch summarization complete",
      ),
    );

    expect(mockFetch).toHaveBeenCalledWith("/api/episodes/batch-summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [1, 2] }),
    });
    expect(mocks.useRealtimeRun).toHaveBeenCalledWith("run_123", {
      accessToken: "tok_abc",
      enabled: true,
    });
    expect(screen.getByText(/2 summarized, 1 skipped/i)).toBeInTheDocument();
  });

  it("shows an error state when the realtime run is cancelled", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          runId: "run_cancelled",
          publicAccessToken: "tok_cancelled",
          total: 2,
          skipped: 0,
        }),
    });

    mocks.useRealtimeRun.mockImplementation(
      (runId: string, options: { enabled: boolean; accessToken: string }) => {
        if (runId !== "run_cancelled" || !options.enabled) {
          return { run: null };
        }

        return { run: realtimeRunFixture("CANCELED") };
      },
    );

    render(<BatchSummarizeButton episodeIds={[11, 12]} />);

    await user.click(screen.getByRole("button", { name: /summarize recent/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm summarizing 2 episodes/i }),
    );

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Batch summarization failed",
      ),
    );

    expect(screen.getByText("Batch run canceled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
