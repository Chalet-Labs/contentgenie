import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    mocks.useRealtimeRun.mockReturnValue({ run: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables the trigger when no valid numeric episode ids remain after filtering", () => {
    render(
      <BatchSummarizeButton episodeIds={["", "abc", -2, 0, Number.NaN]} />,
    );

    expect(
      screen.getByRole("button", { name: /summarize recent/i }),
    ).toBeDisabled();
  });

  it("posts only valid numeric episode ids and enters processing when the batch is queued", async () => {
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

    render(
      <BatchSummarizeButton episodeIds={["42", "abc", 7, -1, 0, Number.NaN]} />,
    );

    await user.click(screen.getByRole("button", { name: /summarize recent/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm summarizing 2 episodes/i }),
    );

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/batch-summarize",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ episodeIds: [42, 7] }),
        }),
      ),
    );

    await waitFor(() =>
      expect(screen.getByText(/processing 1\/3 episodes/i)).toBeInTheDocument(),
    );
    expect(mocks.useRealtimeRun).toHaveBeenCalledWith("run_123", {
      accessToken: "tok_abc",
      enabled: true,
    });
  });

  it("transitions to done and shows a success toast when the realtime run completes", async () => {
    const user = userEvent.setup();
    let run: ReturnType<typeof realtimeRunFixture> | null = null;
    mocks.useRealtimeRun.mockImplementation((runId: string) => ({
      run: runId === "run_123" ? run : null,
    }));
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

    const view = render(<BatchSummarizeButton episodeIds={[1, 2, 3, 4]} />);

    await user.click(screen.getByRole("button", { name: /summarize recent/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm summarizing 4 episodes/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/processing 1\/4 episodes/i)).toBeInTheDocument(),
    );

    run = realtimeRunFixture("COMPLETED", {
      metadata: {
        progress: {
          total: 4,
          succeeded: 3,
          failed: 0,
          skipped: 1,
          completed: 4,
        },
      },
    });
    view.rerender(<BatchSummarizeButton episodeIds={[1, 2, 3, 4]} />);

    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        "Batch summarization complete",
      ),
    );
    expect(screen.getByText(/3 summarized, 1 skipped/i)).toBeInTheDocument();
  });

  it("transitions to error and shows a failure toast when the realtime run is cancelled", async () => {
    const user = userEvent.setup();
    let run: ReturnType<typeof realtimeRunFixture> | null = null;
    mocks.useRealtimeRun.mockImplementation((runId: string) => ({
      run: runId === "run_123" ? run : null,
    }));
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          runId: "run_123",
          publicAccessToken: "tok_abc",
          total: 2,
          skipped: 0,
        }),
    });

    const view = render(<BatchSummarizeButton episodeIds={[1, 2]} />);

    await user.click(screen.getByRole("button", { name: /summarize recent/i }));
    await user.click(
      screen.getByRole("button", { name: /confirm summarizing 2 episodes/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/processing 0\/2 episodes/i)).toBeInTheDocument(),
    );

    run = realtimeRunFixture("CANCELED");
    view.rerender(<BatchSummarizeButton episodeIds={[1, 2]} />);

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Batch summarization failed",
      ),
    );
    expect(screen.getByText(/batch run canceled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
