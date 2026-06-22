import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BatchSummarizeButton } from "@/components/podcasts/batch-summarize-button";
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

describe("BatchSummarizeButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mocks.useRealtimeRun.mockReturnValue({ run: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function startRun() {
    const user = userEvent.setup();
    render(<BatchSummarizeButton episodeIds={[101, 202]} />);

    await user.click(screen.getByRole("button", { name: /summarize recent/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm summarizing 2 episodes/i }),
    );
  }

  it("transitions to done when the realtime run completes successfully", async () => {
    mocks.useRealtimeRun.mockImplementation(
      (_runId: string, options?: { enabled?: boolean }) => ({
        run: options?.enabled
          ? realtimeRunFixture("COMPLETED", {
              metadata: {
                progress: {
                  total: 2,
                  succeeded: 2,
                  failed: 0,
                  skipped: 0,
                  completed: 2,
                },
              },
            })
          : null,
      }),
    );
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        runId: "run_batch",
        publicAccessToken: "tok_batch",
        total: 2,
        skipped: 0,
      }),
    });

    await startRun();

    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        "Batch summarization complete",
      ),
    );
    expect(screen.getByText(/2 summarized, 0 skipped/i)).toBeInTheDocument();
  });

  it("surfaces an error state when the realtime run times out", async () => {
    mocks.useRealtimeRun.mockImplementation(
      (_runId: string, options?: { enabled?: boolean }) => ({
        run: options?.enabled ? realtimeRunFixture("TIMED_OUT") : null,
      }),
    );
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        runId: "run_batch",
        publicAccessToken: "tok_batch",
        total: 2,
        skipped: 0,
      }),
    });

    await startRun();

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Batch summarization failed",
      ),
    );
    expect(screen.getByText(/batch run timed out/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("treats cancelled runs as terminal failures", async () => {
    mocks.useRealtimeRun.mockImplementation(
      (_runId: string, options?: { enabled?: boolean }) => ({
        run: options?.enabled ? realtimeRunFixture("CANCELED") : null,
      }),
    );
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        runId: "run_batch",
        publicAccessToken: "tok_batch",
        total: 2,
        skipped: 0,
      }),
    });

    await startRun();

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Batch summarization failed",
      ),
    );
    expect(screen.getByText(/batch run canceled/i)).toBeInTheDocument();
  });
});
