import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CanonicalTopicRow } from "@/lib/admin/topic-queries";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockAdminUnmergeCanonicals = vi.fn();
vi.mock("@/app/actions/topics", () => ({
  adminUnmergeCanonicals: (...args: unknown[]) =>
    mockAdminUnmergeCanonicals(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { UnmergeDialog } from "@/components/admin/topics/unmerge-dialog";

function makeTopic(
  overrides: Partial<CanonicalTopicRow> = {},
): CanonicalTopicRow {
  return {
    id: 1,
    label: "TypeScript 5.5",
    kind: "release",
    status: "merged",
    episodeCount: 0,
    lastSeen: new Date("2026-01-01"),
    mergedIntoId: 99,
    ...overrides,
  };
}

const sampleEpisodes = [
  { id: 101, title: "Episode One" },
  { id: 102, title: "Episode Two" },
  { id: 103, title: "Episode Three" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminUnmergeCanonicals.mockResolvedValue({
    success: true,
    data: {
      loserId: 1,
      previousWinnerId: 99,
      episodesReassigned: 3,
      episodesSkipped: 0,
      episodesRemovedFromWinner: 3,
    },
  });
});

describe("UnmergeDialog", () => {
  it("shows the loser topic label", () => {
    render(
      <UnmergeDialog
        topic={makeTopic({ label: "TypeScript 5.5" })}
        suggestedEpisodes={sampleEpisodes}
        open
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/TypeScript 5\.5/i)).toBeInTheDocument();
  });

  it("renders all suggested episodes pre-selected", () => {
    render(
      <UnmergeDialog
        topic={makeTopic()}
        suggestedEpisodes={sampleEpisodes}
        open
        onClose={vi.fn()}
      />,
    );
    for (const ep of sampleEpisodes) {
      const checkbox = screen.getByRole("checkbox", { name: ep.title });
      expect(checkbox).toBeChecked();
    }
  });

  it("toggling a suggested episode flips its checkbox state", async () => {
    const user = userEvent.setup();
    render(
      <UnmergeDialog
        topic={makeTopic()}
        suggestedEpisodes={sampleEpisodes}
        open
        onClose={vi.fn()}
      />,
    );
    const firstCheckbox = screen.getByRole("checkbox", {
      name: sampleEpisodes[0].title,
    });
    expect(firstCheckbox).toBeChecked();
    await user.click(firstCheckbox);
    expect(firstCheckbox).not.toBeChecked();
  });

  it("alsoRemoveFromWinner defaults to true", () => {
    render(
      <UnmergeDialog
        topic={makeTopic()}
        suggestedEpisodes={sampleEpisodes}
        open
        onClose={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole("checkbox", {
      name: /also remove selected episodes/i,
    });
    expect(checkbox).toBeChecked();
  });

  it("disables Confirm when no episodes are selected", async () => {
    const user = userEvent.setup();
    render(
      <UnmergeDialog
        topic={makeTopic()}
        suggestedEpisodes={sampleEpisodes}
        open
        onClose={vi.fn()}
      />,
    );
    for (const ep of sampleEpisodes) {
      await user.click(screen.getByRole("checkbox", { name: ep.title }));
    }
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("submitting calls adminUnmergeCanonicals with selected ids and alsoRemoveFromWinner", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <UnmergeDialog
        topic={makeTopic({ id: 1 })}
        suggestedEpisodes={sampleEpisodes}
        open
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(mockAdminUnmergeCanonicals).toHaveBeenCalledWith({
        loserId: 1,
        episodeIdsToReassign: expect.arrayContaining([101, 102, 103]),
        alsoRemoveFromWinner: true,
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("respects unchecked alsoRemoveFromWinner toggle", async () => {
    const user = userEvent.setup();
    render(
      <UnmergeDialog
        topic={makeTopic({ id: 1 })}
        suggestedEpisodes={sampleEpisodes}
        open
        onClose={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /also remove selected episodes/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => {
      expect(mockAdminUnmergeCanonicals).toHaveBeenCalledWith(
        expect.objectContaining({ alsoRemoveFromWinner: false }),
      );
    });
  });

  it("shows error toast when unmerge fails", async () => {
    const user = userEvent.setup();
    mockAdminUnmergeCanonicals.mockResolvedValue({
      success: false,
      error: "not-merged",
    });
    const { toast } = await import("sonner");

    render(
      <UnmergeDialog
        topic={makeTopic({ id: 1 })}
        suggestedEpisodes={sampleEpisodes}
        open
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
