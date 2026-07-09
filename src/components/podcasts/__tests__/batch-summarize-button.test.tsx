import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { realtimeRunFixture } from "@/test/realtime-run";

const mocks = vi.hoisted(() => ({
  useRealtimeRun: vi.fn().mockReturnValue({ run: null }),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: (...args: unknown[]) => mocks.useRealtimeRun(...args),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

const mockFetch = vi.fn();

import { BatchSummarizeButton } from "@/components/podcasts/batch-summarize-button";

describe("BatchSummarizeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mocks.useRealtimeRun.mockReturnValue({ run: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("disables the button when every provided episode id normalizes to an invalid value", () => {
    render(<BatchSummarizeButton episodeIds={["", "abc", -1, 0]} />);

    expect(
      screen.getByRole("button", { name: /summarize recent/i }),
    ).toBeDisabled();
  });

  it("starts realtime tracking after a successful queued response", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          runId: "run_123",
          publicAccessToken: "tok_abc",
          total: 4,
          skipped: 1,
        }),
    });

    render(<BatchSummarizeButton episodeIds={[11, "22", "bad-id"]} />);

    await user.click(screen.getByRole("button", { name: /summarize recent/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm summarizing 2 episodes/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/processing 1\/4 episodes/i)).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/episodes/batch-summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [11, 22] }),
    });
    expect(mocks.useRealtimeRun).toHaveBeenCalledWith("run_123", {
      accessToken: "tok_abc",
      enabled: true,
    });
  });

  it("transitions to done state and fires a success toast when the run completes", async () => {
    mocks.useRealtimeRun.mockReturnValue({
      run: realtimeRunFixture("COMPLETED", {
        metadata: {
          progress: {
            total: 4,
            succeeded: 3,
            failed: 0,
            skipped: 1,
            completed: 4,
          },
        },
      }),
    });

    render(<BatchSummarizeButton episodeIds={[11, 22, 33, 44]} />);

    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        "Batch summarization complete",
      ),
    );
    expect(screen.getByText(/3 summarized, 1 skipped/i)).toBeInTheDocument();
  });

  it("surfaces an error state when the run fails", async () => {
    mocks.useRealtimeRun.mockReturnValue({
      run: realtimeRunFixture("FAILED"),
    });

    render(<BatchSummarizeButton episodeIds={[11, 22]} />);

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Batch summarization failed",
      ),
    );
    expect(screen.getByText(/batch run failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("treats cancelled runs as terminal failures", async () => {
    mocks.useRealtimeRun.mockReturnValue({
      run: realtimeRunFixture("CANCELED"),
    });

    render(<BatchSummarizeButton episodeIds={[11, 22]} />);

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Batch summarization failed",
      ),
    );
    expect(screen.getByText(/batch run canceled/i)).toBeInTheDocument();
  });
});
