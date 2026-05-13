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

// Keep backward-compat alias used by existing tests
const mockUseRealtimeRun = mocks.useRealtimeRun;

// Mock fetch
const mockFetch = vi.fn();

import { OpmlImportForm } from "@/components/podcasts/opml-import-form";

function makeOpmlFile(name = "podcasts.opml", size = 100) {
  const content = "x".repeat(size);
  return new File([content], name, { type: "text/xml" });
}

describe("OpmlImportForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mocks.useRealtimeRun.mockReturnValue({ run: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders file input and disabled import button", () => {
    render(<OpmlImportForm />);

    expect(screen.getByLabelText("Select OPML file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("enables import button when a file is selected", async () => {
    const user = userEvent.setup();
    render(<OpmlImportForm />);

    const fileInput = screen.getByLabelText("Select OPML file");
    const file = makeOpmlFile();
    await user.upload(fileInput, file);

    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
  });

  it("shows error for oversized files", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<OpmlImportForm />);

    const fileInput = screen.getByLabelText("Select OPML file");
    // Use a file that's over 1MB but small enough not to trigger the large import dialog
    // (file size check runs before the dialog check)
    const largeFile = makeOpmlFile("large.opml", 1.5 * 1024 * 1024);
    await user.upload(fileInput, largeFile);
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(screen.getByText(/too large/i)).toBeInTheDocument();
    unmount();
  });

  it("shows uploading state during API call", async () => {
    const user = userEvent.setup();
    // Make fetch hang
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<OpmlImportForm />);

    const fileInput = screen.getByLabelText("Select OPML file");
    await user.upload(fileInput, makeOpmlFile());
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(screen.getByText("Uploading...")).toBeInTheDocument();
  });

  it("shows done state when all feeds are already subscribed", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          total: 5,
          alreadySubscribed: 5,
        }),
    });

    render(<OpmlImportForm />);

    const fileInput = screen.getByLabelText("Select OPML file");
    await user.upload(fileInput, makeOpmlFile());
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByText(/already subscribed/i)).toBeInTheDocument();
    });
  });

  it("shows error state on API failure", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: "Invalid OPML file",
        }),
    });

    render(<OpmlImportForm />);

    const fileInput = screen.getByLabelText("Select OPML file");
    await user.upload(fileInput, makeOpmlFile());
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid OPML file")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows rate limit error", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: () =>
        Promise.resolve({
          error: "Rate limit exceeded",
        }),
    });

    render(<OpmlImportForm />);

    const fileInput = screen.getByLabelText("Select OPML file");
    await user.upload(fileInput, makeOpmlFile());
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByText(/Rate limit exceeded/i)).toBeInTheDocument();
    });
  });

  it("enters processing state on successful API response with runId", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          runId: "run_123",
          publicAccessToken: "tok_abc",
          total: 10,
          alreadySubscribed: 3,
        }),
    });

    render(<OpmlImportForm />);

    const fileInput = screen.getByLabelText("Select OPML file");
    await user.upload(fileInput, makeOpmlFile());
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByText(/Importing 3\/10 feeds/i)).toBeInTheDocument();
    });

    // Verify useRealtimeRun was called with the run ID
    expect(mockUseRealtimeRun).toHaveBeenCalledWith("run_123", {
      accessToken: "tok_abc",
      enabled: true,
    });
  });

  it("shows retry button on error and error message is visible", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Server error" }),
    });

    render(<OpmlImportForm />);

    const fileInput = screen.getByLabelText("Select OPML file");
    await user.upload(fileInput, makeOpmlFile());
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("transitions to done state and fires success toast when run completes", async () => {
    mocks.useRealtimeRun.mockReturnValue({
      run: realtimeRunFixture("COMPLETED", {
        metadata: {
          progress: {
            total: 5,
            succeeded: 5,
            failed: 0,
            skipped: 0,
            completed: 5,
          },
        },
      }),
    });

    render(<OpmlImportForm />);

    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith("OPML import complete"),
    );
    expect(screen.getByText(/5 subscribed/)).toBeInTheDocument();
  });

  it("transitions to error state and fires error toast when run fails", async () => {
    mocks.useRealtimeRun.mockReturnValue({
      run: realtimeRunFixture("FAILED"),
    });

    render(<OpmlImportForm />);

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("OPML import failed"),
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("transitions to error state and fires error toast when run is cancelled", async () => {
    mocks.useRealtimeRun.mockReturnValue({
      run: realtimeRunFixture("CANCELED"),
    });

    render(<OpmlImportForm />);

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("OPML import failed"),
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("resets to idle state when retry button is clicked", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Server error" }),
    });

    render(<OpmlImportForm />);

    const fileInput = screen.getByLabelText("Select OPML file");
    await user.upload(fileInput, makeOpmlFile());
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Import" }),
      ).toBeInTheDocument();
    });
  });
});
