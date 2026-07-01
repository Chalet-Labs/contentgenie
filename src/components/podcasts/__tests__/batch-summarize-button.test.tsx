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
    vi.unstubAllGlobals();
  });

  it("disables the trigger when every episode ID coerces to an invalid number", () => {
    render(<BatchSummarizeButton episodeIds={["", "nope", 0, -3]} />);

    expect(
      screen.getByRole("button", { name: "Summarize Recent" }),
    ).toBeDisabled();
  });

  it("posts only positive numeric episode IDs after confirmation", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          alreadyCached: true,
          total: 2,
          skipped: 2,
        }),
    });

    render(
      <BatchSummarizeButton
        episodeIds={["101", "bogus", 0, -2, 202, Number.NaN]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Summarize Recent" }));
    await user.click(
      screen.getByRole("button", { name: "Confirm summarizing 2 episodes" }),
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/batch-summarize",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ episodeIds: [101, 202] }),
        }),
      );
    });
  });

  it("transitions to done and fires a success toast when the realtime run completes", async () => {
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

    mocks.useRealtimeRun.mockImplementation((...args: unknown[]) => {
      const options = args[1] as { enabled?: boolean } | undefined;
      if (options?.enabled) {
        return {
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
        };
      }
      return { run: null };
    });

    render(<BatchSummarizeButton episodeIds={[11, 22, 33, 44]} />);

    await user.click(screen.getByRole("button", { name: "Summarize Recent" }));
    await user.click(
      screen.getByRole("button", { name: "Confirm summarizing 4 episodes" }),
    );

    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(
        "Batch summarization complete",
      ),
    );
    expect(screen.getByText("3 summarized, 1 skipped")).toBeInTheDocument();
  });

  it("transitions to error and fires an error toast when the realtime run is cancelled", async () => {
    const user = userEvent.setup();
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

    mocks.useRealtimeRun.mockImplementation((...args: unknown[]) => {
      const options = args[1] as { enabled?: boolean } | undefined;
      if (options?.enabled) {
        return { run: realtimeRunFixture("CANCELED") };
      }
      return { run: null };
    });

    render(<BatchSummarizeButton episodeIds={[11, 22]} />);

    await user.click(screen.getByRole("button", { name: "Summarize Recent" }));
    await user.click(
      screen.getByRole("button", { name: "Confirm summarizing 2 episodes" }),
    );

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        "Batch summarization failed",
      ),
    );
    expect(screen.getByText("Batch run canceled")).toBeInTheDocument();
  });
});
