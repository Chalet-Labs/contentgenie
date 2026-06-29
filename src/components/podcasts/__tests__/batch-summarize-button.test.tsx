import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BatchSummarizeButton } from "@/components/podcasts/batch-summarize-button";
import { realtimeRunFixture } from "@/test/realtime-run";

const mocks = vi.hoisted(() => ({
  useRealtimeRun: vi.fn().mockReturnValue({ run: null }),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: (...args: unknown[]) => mocks.useRealtimeRun(...args),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

describe("BatchSummarizeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useRealtimeRun.mockReturnValue({ run: null });
  });

  it("transitions to done state and fires a success toast when the batch run completes", async () => {
    mocks.useRealtimeRun.mockReturnValue({
      run: realtimeRunFixture("COMPLETED", {
        metadata: {
          progress: {
            total: 5,
            succeeded: 4,
            failed: 1,
            skipped: 0,
            completed: 5,
          },
        },
      }),
    });

    render(<BatchSummarizeButton episodeIds={[1, 2, 3, 4, 5]} />);

    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        "Batch summarization complete",
      ),
    );
    expect(screen.getByText(/4 summarized, 0 skipped/i)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/i)).toBeInTheDocument();
  });

  it("transitions to error state and fires an error toast when the batch run fails", async () => {
    mocks.useRealtimeRun.mockReturnValue({
      run: realtimeRunFixture("FAILED"),
    });

    render(<BatchSummarizeButton episodeIds={[1, 2, 3]} />);

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Batch summarization failed",
      ),
    );
    expect(screen.getByText(/batch run failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("transitions to error state and fires an error toast when the batch run is cancelled", async () => {
    mocks.useRealtimeRun.mockReturnValue({
      run: realtimeRunFixture("CANCELED"),
    });

    render(<BatchSummarizeButton episodeIds={[1, 2, 3]} />);

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Batch summarization failed",
      ),
    );
    expect(screen.getByText(/batch run canceled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
