import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  useRealtimeRun: vi.fn(),
  triggerTopicDigestRefresh: vi.fn(),
  routerRefresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: mocks.useRealtimeRun,
}));

vi.mock("@/app/actions/topics", () => ({
  triggerTopicDigestRefresh: mocks.triggerTopicDigestRefresh,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.routerRefresh }),
}));

vi.mock("sonner", () => ({
  toast: mocks.toast,
}));

import { TopicDigestPanel } from "@/components/topics/topic-digest-panel";
import type { TopicDigest } from "@/app/actions/topics";

const sampleDigest: TopicDigest = {
  id: 22,
  digestMarkdown: "## Body markdown\n\nSome body text.",
  consensusPoints: ["Consensus A", "Consensus B"],
  disagreementPoints: ["Disagreement A"],
  episodeCountAtGeneration: 4,
  modelUsed: "gpt-x",
  generatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useRealtimeRun.mockReturnValue({ run: null });
});

describe("TopicDigestPanel", () => {
  it("renders consensus, disagreement, and markdown body when initialDigest is set", () => {
    render(
      <TopicDigestPanel
        canonicalTopicId={1}
        initialDigest={sampleDigest}
        initialRunId={null}
        initialAccessToken={null}
        canRefresh
      />,
    );
    expect(screen.getByText("Consensus A")).toBeInTheDocument();
    expect(screen.getByText("Consensus B")).toBeInTheDocument();
    expect(screen.getByText("Disagreement A")).toBeInTheDocument();
    expect(screen.getByText(/Body markdown/)).toBeInTheDocument();
    expect(screen.getByText(/just now/i)).toBeInTheDocument();
  });

  it("Refresh button → 'cached' shows a toast and stays on existing digest", async () => {
    const user = userEvent.setup();
    mocks.triggerTopicDigestRefresh.mockResolvedValue({
      success: true,
      data: { status: "cached", digestId: 22 },
    });
    render(
      <TopicDigestPanel
        canonicalTopicId={1}
        initialDigest={sampleDigest}
        initialRunId={null}
        initialAccessToken={null}
        canRefresh
      />,
    );
    await user.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
    expect(screen.getByText("Consensus A")).toBeInTheDocument();
  });

  it("Refresh button → 'queued' transitions to loading state and subscribes via useRealtimeRun", async () => {
    const user = userEvent.setup();
    mocks.triggerTopicDigestRefresh.mockResolvedValue({
      success: true,
      data: {
        status: "queued",
        runId: "run_new",
        publicAccessToken: "tok_new",
      },
    });
    render(
      <TopicDigestPanel
        canonicalTopicId={1}
        initialDigest={sampleDigest}
        initialRunId={null}
        initialAccessToken={null}
        canRefresh
      />,
    );
    await user.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() =>
      expect(mocks.useRealtimeRun).toHaveBeenCalledWith(
        "run_new",
        expect.objectContaining({
          accessToken: "tok_new",
          enabled: true,
        }),
      ),
    );
    expect(screen.getByText(/synthesizing/i)).toBeInTheDocument();
  });

  it("Refresh button → 'ineligible' swaps to a not-eligible message", async () => {
    const user = userEvent.setup();
    mocks.triggerTopicDigestRefresh.mockResolvedValue({
      success: true,
      data: { status: "ineligible" },
    });
    render(
      <TopicDigestPanel
        canonicalTopicId={1}
        initialDigest={null}
        initialRunId={null}
        initialAccessToken={null}
        canRefresh
      />,
    );
    await user.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() =>
      expect(screen.getByText(/not enough/i)).toBeInTheDocument(),
    );
  });

  it("mounts in loading state when initialRunId + initialAccessToken are passed without a digest", () => {
    render(
      <TopicDigestPanel
        canonicalTopicId={1}
        initialDigest={null}
        initialRunId="run_initial"
        initialAccessToken="tok_initial"
        canRefresh
      />,
    );
    expect(mocks.useRealtimeRun).toHaveBeenCalledWith(
      "run_initial",
      expect.objectContaining({
        accessToken: "tok_initial",
        enabled: true,
      }),
    );
    expect(screen.getByText(/synthesizing/i)).toBeInTheDocument();
  });

  it("calls router.refresh() when run.status transitions to COMPLETED", async () => {
    mocks.useRealtimeRun.mockReturnValue({ run: { status: "COMPLETED" } });
    render(
      <TopicDigestPanel
        canonicalTopicId={1}
        initialDigest={null}
        initialRunId="run_xyz"
        initialAccessToken="tok_xyz"
        canRefresh
      />,
    );
    await waitFor(() => expect(mocks.routerRefresh).toHaveBeenCalledTimes(1));
  });

  it("surfaces a non-blocking error when run.status is FAILED, with a Retry button", async () => {
    mocks.useRealtimeRun.mockReturnValue({ run: { status: "FAILED" } });
    render(
      <TopicDigestPanel
        canonicalTopicId={1}
        initialDigest={null}
        initialRunId="run_xyz"
        initialAccessToken="tok_xyz"
        canRefresh
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Synthesis failed|failed to generate/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("surfaces a non-blocking error when run.status is CANCELED", async () => {
    mocks.useRealtimeRun.mockReturnValue({ run: { status: "CANCELED" } });
    render(
      <TopicDigestPanel
        canonicalTopicId={1}
        initialDigest={null}
        initialRunId="run_xyz"
        initialAccessToken="tok_xyz"
        canRefresh
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Synthesis failed|canceled|cancelled/i),
      ).toBeInTheDocument(),
    );
  });
});
