import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LISTEN_STATE_CHANGED_EVENT } from "@/lib/events";

const mockRecordListenEvent = vi.fn();
vi.mock("@/app/actions/listen-history", () => ({
  recordListenEvent: (...args: unknown[]) => mockRecordListenEvent(...args),
}));

describe("ListenedButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordListenEvent.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("renders a button with aria-label 'Mark as listened' when isListened is false", async () => {
    const { ListenedButton } =
      await import("@/components/episodes/listened-button");
    render(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={false} />);
    expect(
      screen.getByRole("button", { name: "Mark as listened" }),
    ).toBeInTheDocument();
  });

  it("renders non-button indicator with aria-label 'Already listened' when isListened is true", async () => {
    const { ListenedButton } =
      await import("@/components/episodes/listened-button");
    render(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={true} />);
    expect(
      screen.queryByRole("button", { name: "Mark as listened" }),
    ).toBeNull();
    expect(screen.getByLabelText("Already listened")).toBeInTheDocument();
  });

  it("flips to the listened indicator when the isListened prop updates after mount", async () => {
    const { ListenedButton } =
      await import("@/components/episodes/listened-button");
    const { rerender } = render(
      <ListenedButton podcastIndexEpisodeId="ep-1" isListened={false} />,
    );
    expect(
      screen.getByRole("button", { name: "Mark as listened" }),
    ).toBeInTheDocument();

    rerender(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={true} />);
    expect(
      screen.queryByRole("button", { name: "Mark as listened" }),
    ).toBeNull();
    expect(screen.getByLabelText("Already listened")).toBeInTheDocument();
  });

  it("optimistically flips UI immediately on click before action resolves", async () => {
    let resolveAction!: (v: { success: boolean }) => void;
    mockRecordListenEvent.mockReturnValue(
      new Promise((res) => {
        resolveAction = res;
      }),
    );

    const { ListenedButton } =
      await import("@/components/episodes/listened-button");
    const user = userEvent.setup();
    render(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={false} />);

    const btn = screen.getByRole("button", { name: "Mark as listened" });
    await user.click(btn);

    expect(
      screen.queryByRole("button", { name: "Mark as listened" }),
    ).toBeNull();
    expect(screen.getByLabelText("Already listened")).toBeInTheDocument();

    await act(async () => {
      resolveAction({ success: true });
    });
  });

  it("reverts and shows error toast when action returns { success: false }", async () => {
    mockRecordListenEvent.mockResolvedValue({ success: false, error: "boom" });

    const { ListenedButton } =
      await import("@/components/episodes/listened-button");
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={false} />);

    await user.click(screen.getByRole("button", { name: "Mark as listened" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Mark as listened" }),
      ).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith("boom");
    });
  });

  it("uses fallback error message when action returns { success: false } with no error field", async () => {
    mockRecordListenEvent.mockResolvedValue({ success: false });

    const { ListenedButton } =
      await import("@/components/episodes/listened-button");
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={false} />);

    await user.click(screen.getByRole("button", { name: "Mark as listened" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Mark as listened" }),
      ).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith("Failed to mark as listened");
    });
  });

  it("reverts and shows connection-error toast when action rejects", async () => {
    mockRecordListenEvent.mockRejectedValue(new Error("network down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { ListenedButton } =
      await import("@/components/episodes/listened-button");
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={false} />);

    await user.click(screen.getByRole("button", { name: "Mark as listened" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Mark as listened" }),
      ).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith(
        "Could not mark as listened — check your connection",
      );
      expect(consoleSpy).toHaveBeenCalled();
    });
    expect(
      dispatchSpy.mock.calls.some(
        (call) =>
          call[0] instanceof CustomEvent &&
          (call[0] as CustomEvent).type === LISTEN_STATE_CHANGED_EVENT,
      ),
    ).toBe(false);
  });

  it("dispatches LISTEN_STATE_CHANGED_EVENT and shows success toast on success", async () => {
    mockRecordListenEvent.mockResolvedValue({ success: true });

    const { ListenedButton } =
      await import("@/components/episodes/listened-button");
    const { toast } = await import("sonner");
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const user = userEvent.setup();
    render(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={false} />);

    await user.click(screen.getByRole("button", { name: "Mark as listened" }));

    await waitFor(() => {
      const dispatched = dispatchSpy.mock.calls.find(
        (call) =>
          call[0] instanceof CustomEvent &&
          (call[0] as CustomEvent).type === LISTEN_STATE_CHANGED_EVENT,
      );
      expect(dispatched).toBeTruthy();
      expect(toast.success).toHaveBeenCalledWith("Marked as listened");
    });
  });
});
