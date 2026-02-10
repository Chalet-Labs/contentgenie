import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveButton } from "@/components/episodes/save-button";

vi.mock("@/app/actions/library", () => ({
  saveEpisodeToLibrary: vi.fn(),
  removeEpisodeFromLibrary: vi.fn(),
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

  it("calls saveEpisodeToLibrary on click", async () => {
    const { saveEpisodeToLibrary } = await import("@/app/actions/library");
    vi.mocked(saveEpisodeToLibrary).mockResolvedValue({
      success: true,
      message: "Saved",
    });

    const user = userEvent.setup();
    render(<SaveButton episodeData={mockEpisodeData} />);

    await user.click(screen.getByRole("button"));
    expect(saveEpisodeToLibrary).toHaveBeenCalledWith(mockEpisodeData);
  });

  it("calls removeEpisodeFromLibrary when already saved", async () => {
    const { removeEpisodeFromLibrary } = await import("@/app/actions/library");
    vi.mocked(removeEpisodeFromLibrary).mockResolvedValue({
      success: true,
      message: "Removed",
    });

    const user = userEvent.setup();
    render(<SaveButton episodeData={mockEpisodeData} initialSaved={true} />);

    await user.click(screen.getByRole("button"));
    expect(removeEpisodeFromLibrary).toHaveBeenCalledWith("123");
  });

  it("shows error toast on failure", async () => {
    const { saveEpisodeToLibrary } = await import("@/app/actions/library");
    vi.mocked(saveEpisodeToLibrary).mockResolvedValue({
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
