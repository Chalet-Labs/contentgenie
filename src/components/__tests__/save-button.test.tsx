import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveButton } from "@/components/episodes/save-button";

vi.mock("@/lib/offline-actions", () => ({
  offlineSaveEpisode: vi.fn(),
  offlineUnsaveEpisode: vi.fn(),
}));

vi.mock("@/hooks/use-sync-queue", () => ({
  useSyncQueue: () => ({ hasPending: () => false }),
}));

vi.mock("@/hooks/use-online-status", () => ({
  useOnlineStatus: () => true,
}));

const mockEpisodeData = {
  podcastIndexId: "123",
  title: "Test Episode",
  description: "A test episode",
  podcast: {
    podcastIndexId: "456",
    title: "Test Podcast",
  },
};

describe("SaveButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("renders 'Save' when not saved", () => {
    render(<SaveButton episodeData={mockEpisodeData} />);
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("renders 'Saved' when initialSaved is true", () => {
    render(<SaveButton episodeData={mockEpisodeData} initialSaved={true} />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("calls offlineSaveEpisode on click", async () => {
    const { offlineSaveEpisode } = await import("@/lib/offline-actions");
    vi.mocked(offlineSaveEpisode).mockResolvedValue({
      success: true,
      message: "Saved",
    });

    const user = userEvent.setup();
    render(<SaveButton episodeData={mockEpisodeData} />);

    await user.click(screen.getByRole("button"));
    expect(offlineSaveEpisode).toHaveBeenCalledWith(mockEpisodeData, true);
  });

  it("calls offlineUnsaveEpisode when already saved", async () => {
    const { offlineUnsaveEpisode } = await import("@/lib/offline-actions");
    vi.mocked(offlineUnsaveEpisode).mockResolvedValue({
      success: true,
      message: "Removed",
    });

    const user = userEvent.setup();
    render(<SaveButton episodeData={mockEpisodeData} initialSaved={true} />);

    await user.click(screen.getByRole("button"));
    expect(offlineUnsaveEpisode).toHaveBeenCalledWith("123", true);
  });

  it("shows error toast on failure", async () => {
    const { offlineSaveEpisode } = await import("@/lib/offline-actions");
    vi.mocked(offlineSaveEpisode).mockResolvedValue({
      success: false,
      error: "Network error",
    });

    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<SaveButton episodeData={mockEpisodeData} />);

    await user.click(screen.getByRole("button"));
    expect(toast.error).toHaveBeenCalled();
  });
});
