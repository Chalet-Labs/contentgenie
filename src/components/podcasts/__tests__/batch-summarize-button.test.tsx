import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { realtimeRunFixture } from "@/test/realtime-run";

const mocks = vi.hoisted(() => ({
  useRealtimeRun: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

let currentRun: ReturnType<typeof realtimeRunFixture> | null = null;

vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: (...args: unknown[]) => mocks.useRealtimeRun(...args),
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

const mockFetch = vi.fn();

import { BatchSummarizeButton } from "@/components/podcasts/batch-summarize-button";

describe("BatchSummarizeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRun = null;
    mocks.useRealtimeRun.mockImplementation(() => ({ run: currentRun }));
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("transitions to done when the Trigger.dev run completes successfully", async () => {
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

    const { rerender } = render(
      <BatchSummarizeButton episodeIds={[11, 12, 13]} />,
    );

    await user.click(screen.getByRole("button", { name: /summarize recent/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm summarizing 3 episodes/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Processing 1/3 episodes..."),
      ).toBeInTheDocument();
    });

    currentRun = realtimeRunFixture("COMPLETED", {
      metadata: {
        progress: {
          total: 3,
          succeeded: 2,
          failed: 0,
          skipped: 1,
          completed: 3,
        },
      },
    });
    rerender(<BatchSummarizeButton episodeIds={[11, 12, 13]} />);

    await waitFor(() => {
      expect(screen.getByText("2 summarized, 1 skipped")).toBeInTheDocument();
    });

    expect(mocks.useRealtimeRun).toHaveBeenCalledWith("run_123", {
      accessToken: "tok_abc",
      enabled: true,
    });
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Batch summarization complete",
    );
  });

  it("treats a cancelled Trigger.dev run as a terminal error", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          runId: "run_456",
          publicAccessToken: "tok_def",
          total: 2,
          skipped: 0,
        }),
    });

    const { rerender } = render(<BatchSummarizeButton episodeIds={[21, 22]} />);

    await user.click(screen.getByRole("button", { name: /summarize recent/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm summarizing 2 episodes/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Processing 0/2 episodes..."),
      ).toBeInTheDocument();
    });

    currentRun = realtimeRunFixture("CANCELED");
    rerender(<BatchSummarizeButton episodeIds={[21, 22]} />);

    await waitFor(() => {
      expect(screen.getByText("Batch run canceled")).toBeInTheDocument();
    });

    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Batch summarization failed",
    );
  });
});
