import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { LinkedEpisodeRow } from "@/lib/admin/topic-queries";

const mockTriggerFullResummarize = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/topics", () => ({
  triggerFullResummarize: (...args: unknown[]) =>
    mockTriggerFullResummarize(...args),
}));

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import React from "react";
import { LinkedEpisodesPanel } from "@/components/admin/topics/linked-episodes-panel";

function makeEpisode(
  overrides: Partial<LinkedEpisodeRow> = {},
): LinkedEpisodeRow {
  return {
    episodeId: 1,
    podcastIndexId: "pod-1",
    title: "Ep 1",
    transcriptStatus: "available",
    summaryStatus: null,
    matchMethod: "embedding",
    similarityToTopMatch: 0.92,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LinkedEpisodesPanel", () => {
  it("renders empty state when no episodes", () => {
    render(<LinkedEpisodesPanel episodes={[]} />);
    expect(screen.getByText(/no linked episodes/i)).toBeInTheDocument();
  });

  it("renders episode rows", () => {
    const ep = makeEpisode({ episodeId: 5, title: "Hello World" });
    render(<LinkedEpisodesPanel episodes={[ep]} />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
    expect(screen.getByText("embedding")).toBeInTheDocument();
    expect(screen.getByText("0.920")).toBeInTheDocument();
  });

  it("re-summarize button is disabled when no transcript", () => {
    const ep = makeEpisode({ transcriptStatus: "pending" });
    render(<LinkedEpisodesPanel episodes={[ep]} />);
    expect(
      screen.getByRole("button", { name: /re-summarize/i }),
    ).toBeDisabled();
  });

  it("re-summarize button is disabled when summary is busy", () => {
    const ep = makeEpisode({ summaryStatus: "queued" });
    render(<LinkedEpisodesPanel episodes={[ep]} />);
    expect(
      screen.getByRole("button", { name: /re-summarize/i }),
    ).toBeDisabled();
  });

  it("clicking re-summarize calls triggerFullResummarize and shows success toast", async () => {
    mockTriggerFullResummarize.mockResolvedValue({
      success: true,
      data: { runId: "run-abc", episodeId: 1 },
    });
    const ep = makeEpisode({ episodeId: 1 });
    render(<LinkedEpisodesPanel episodes={[ep]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /re-summarize/i }));
    });

    expect(mockTriggerFullResummarize).toHaveBeenCalledWith({ episodeId: 1 });
    expect(mockToast.success).toHaveBeenCalledWith(
      expect.stringContaining("run-abc"),
    );
  });

  it("shows error toast on triggerFullResummarize failure", async () => {
    mockTriggerFullResummarize.mockResolvedValue({
      success: false,
      error: "no-transcript",
    });
    const ep = makeEpisode({ episodeId: 2 });
    render(<LinkedEpisodesPanel episodes={[ep]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /re-summarize/i }));
    });

    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringContaining("no-transcript"),
    );
  });
});
