import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Mock next/navigation ─────────────────────────────────────────────────────

const mockRouterPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

// ─── Mock triggerTopicDigestGeneration ────────────────────────────────────────

const mockTriggerTopicDigestGeneration = vi.fn();
vi.mock("@/app/actions/topics", () => ({
  triggerTopicDigestGeneration: (...args: unknown[]) =>
    mockTriggerTopicDigestGeneration(...args),
}));

// ─── Import component under test ──────────────────────────────────────────────

import { SynthesizeButton } from "@/components/episodes/synthesize-button";

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockTriggerTopicDigestGeneration.mockResolvedValue({
    success: true,
    data: { status: "queued" },
  });
});

describe("SynthesizeButton", () => {
  const defaultProps = {
    canonicalTopicId: 42,
    label: "AI Ethics",
  };

  // ── Renders icon button with aria-label ───────────────────────────────────

  it("renders an icon button with correct aria-label", () => {
    render(<SynthesizeButton {...defaultProps} />);
    const button = screen.getByRole("button", {
      name: /synthesize digest for AI Ethics/i,
    });
    expect(button).toBeInTheDocument();
  });

  // ── Click: action called with canonicalTopicId ────────────────────────────

  it("click: triggerTopicDigestGeneration called once with canonicalTopicId", async () => {
    const user = userEvent.setup();
    render(<SynthesizeButton {...defaultProps} />);
    const button = screen.getByRole("button", { name: /synthesize/i });
    await user.click(button);
    expect(mockTriggerTopicDigestGeneration).toHaveBeenCalledOnce();
    expect(mockTriggerTopicDigestGeneration).toHaveBeenCalledWith({
      canonicalTopicId: 42,
    });
  });

  // ── Click: router.push fired after action resolves ────────────────────────

  it("click: router.push called with /topic/:id after action resolves", async () => {
    const user = userEvent.setup();
    render(<SynthesizeButton {...defaultProps} />);
    const button = screen.getByRole("button", { name: /synthesize/i });
    await user.click(button);
    expect(mockRouterPush).toHaveBeenCalledWith("/topic/42");
  });

  // ── Click: action called before router.push (order via mock invocationCallOrder) ─

  it("click: action is called before router.push (vi mock invocationCallOrder)", async () => {
    const user = userEvent.setup();
    render(<SynthesizeButton {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /synthesize/i }));

    expect(mockTriggerTopicDigestGeneration).toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalled();
    const actionCallOrder =
      mockTriggerTopicDigestGeneration.mock.invocationCallOrder[0]!;
    const pushCallOrder = mockRouterPush.mock.invocationCallOrder[0]!;
    expect(actionCallOrder).toBeLessThan(pushCallOrder);
  });

  // ── Action error: router.push still fires ────────────────────────────────

  it("action error: router.push still fires even when action throws", async () => {
    mockTriggerTopicDigestGeneration.mockRejectedValue(
      new Error("Network error"),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const user = userEvent.setup();
    render(<SynthesizeButton {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /synthesize/i }));

    expect(mockRouterPush).toHaveBeenCalledWith("/topic/42");
    consoleSpy.mockRestore();
  });

  // ── Double-click prevention: button is disabled mid-action; second click no-ops ─

  it("disables button while the action is in flight; second click does NOT re-fire", async () => {
    // Deferred-promise pattern: hold the action open, click twice, confirm
    // only one invocation happened. This is the contract — the manual
    // `useState` loading flag (NOT useTransition) tracks the full async
    // lifecycle including the awaited portion.
    let resolve!: (value: {
      success: true;
      data: { status: "queued" };
    }) => void;
    mockTriggerTopicDigestGeneration.mockImplementation(
      () =>
        new Promise<{ success: true; data: { status: "queued" } }>((r) => {
          resolve = r;
        }),
    );

    const user = userEvent.setup();
    render(<SynthesizeButton {...defaultProps} />);
    const button = screen.getByRole("button", {
      name: /synthesize digest for/i,
    });

    await user.click(button);
    // Mid-flight: button must be disabled, second click should be a no-op.
    expect(button).toBeDisabled();
    await user.click(button);
    expect(mockTriggerTopicDigestGeneration).toHaveBeenCalledTimes(1);

    // Resolve and let the finally-block run (router.push fires there).
    resolve({ success: true, data: { status: "queued" } });
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith("/topic/42"),
    );
  });
});
