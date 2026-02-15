import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareButton } from "@/components/ui/share-button";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

const defaultProps = {
  title: "Test Episode",
  text: "Check out this episode",
  url: "https://example.com/episode/123",
};

function cleanupShareMocks() {
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true, writable: true });
  Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true, writable: true });
}

describe("ShareButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupShareMocks();
  });

  it("renders Share button text", () => {
    render(<ShareButton {...defaultProps} />);
    expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
  });

  it("calls navigator.share when share and canShare are available", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    const canShareMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true, writable: true });
    Object.defineProperty(navigator, "canShare", { value: canShareMock, configurable: true, writable: true });

    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(canShareMock).toHaveBeenCalledWith({
        title: defaultProps.title,
        text: defaultProps.text,
        url: defaultProps.url,
      });
      expect(shareMock).toHaveBeenCalledWith({
        title: defaultProps.title,
        text: defaultProps.text,
        url: defaultProps.url,
      });
    });
  });

  it("silently handles AbortError from cancelled share", async () => {
    const abortError = new DOMException("Share cancelled", "AbortError");
    const shareMock = vi.fn().mockRejectedValue(abortError);
    const canShareMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true, writable: true });
    Object.defineProperty(navigator, "canShare", { value: canShareMock, configurable: true, writable: true });

    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalled();
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when canShare returns false", async () => {
    const canShareMock = vi.fn().mockReturnValue(false);
    Object.defineProperty(navigator, "share", { value: vi.fn(), configurable: true, writable: true });
    Object.defineProperty(navigator, "canShare", { value: canShareMock, configurable: true, writable: true });

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeTextMock);

    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(defaultProps.url);
      expect(toast.success).toHaveBeenCalledWith("Link copied to clipboard");
    });
  });

  it("falls back to clipboard when navigator.share is undefined", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeTextMock);

    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(defaultProps.url);
      expect(toast.success).toHaveBeenCalledWith("Link copied to clipboard");
    });
  });

  it("shows toast with URL when both share and clipboard fail", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Clipboard denied"));

    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith("Could not copy link", {
        description: defaultProps.url,
      });
    });
  });

  it("falls back to clipboard when share throws non-AbortError", async () => {
    const shareMock = vi.fn().mockRejectedValue(new TypeError("Share failed"));
    const canShareMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true, writable: true });
    Object.defineProperty(navigator, "canShare", { value: canShareMock, configurable: true, writable: true });

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeTextMock);

    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(defaultProps.url);
      expect(toast.success).toHaveBeenCalledWith("Link copied to clipboard");
    });
  });

  it("accepts custom size and variant props", () => {
    render(<ShareButton {...defaultProps} size="sm" variant="secondary" />);
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });
});
