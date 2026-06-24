import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { realtimeRunFixture } from "@/test/realtime-run";

const mocks = vi.hoisted(() => ({
  useRealtimeRun: vi.fn(),
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
    mocks.useRealtimeRun.mockImplementation((_runId: string, options) => ({
      run: options?.enabled ? null : null,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows completed progress and success toast when the realtime run succeeds", async () => {
    const user = userEvent.setup();
    mocks.useRealtimeRun.mockImplementation((_runId: string, options) => ({
      run: options?.enabled
        ? realtimeRunFixture("COMPLETED", {
            metadata: {
              progress: {
                total: 3,
                succeeded: 2,
                failed: 0,
                skipped: 1,
                completed: 3,
              },
            },
          })
        : null,
    }));
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

    render(<BatchSummarizeButton episodeIds={[11, "12", 13]} />);

    await user.click(screen.getByRole("button", { name: /summarize recent/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm summarizing 3 episodes/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("2 summarized, 1 skipped")).toBeInTheDocument();
    });

    expect(mocks.toast.success).toHaveBeenCalledWith(
      "Batch summarization complete",
    );
    expect(mocks.useRealtimeRun).toHaveBeenCalledWith("run_123", {
      accessToken: "tok_abc",
      enabled: true,
    });
  });

  it("surfaces timed-out runs as terminal failures via the SDK boolean helpers", async () => {
    const user = userEvent.setup();
    mocks.useRealtimeRun.mockImplementation((_runId: string, options) => ({
      run: options?.enabled ? realtimeRunFixture("TIMED_OUT") : null,
    }));
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          runId: "run_timeout",
          publicAccessToken: "tok_timeout",
          total: 2,
          skipped: 0,
        }),
    });

    render(<BatchSummarizeButton episodeIds={[21, 22]} />);

    await user.click(screen.getByRole("button", { name: /summarize recent/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm summarizing 2 episodes/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Batch run timed out")).toBeInTheDocument();
    });

    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Batch summarization failed",
    );
  });
});
