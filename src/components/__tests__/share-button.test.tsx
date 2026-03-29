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
  text: "Test Episode",
  url: "https://contentgenie.ch/episode/123",
};

function cleanupShareMocks() {
  Object.defineProperty(navigator, "share", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "canShare", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

describe("ShareButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanupShareMocks();
  });

  it("renders the Share trigger button", () => {
    render(<ShareButton {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /share/i })
    ).toBeInTheDocument();
  });

  it("shows Copy link option in dropdown", async () => {
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /share/i }));
    expect(screen.getByText("Copy link")).toBeInTheDocument();
  });

  it("does not show native Share option when navigator.share is unavailable", async () => {
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /share/i }));
    // Only "Copy link" should be present, no "Share" menu item
    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems).toHaveLength(1);
    expect(menuItems[0]).toHaveTextContent("Copy link");
  });

  it("shows native Share option when navigator.share is available", async () => {
    Object.defineProperty(navigator, "share", {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
      writable: true,
    });

    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /share/i }));
    // Scope to menuitems to avoid matching the trigger button which also says "Share"
    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.some((item) => item.textContent?.includes("Share"))).toBe(true);
    expect(screen.getByText("Copy link")).toBeInTheDocument();
  });

  it("does not show Copy with summary when no summary prop", async () => {
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /share/i }));
    expect(screen.queryByText("Copy with summary")).not.toBeInTheDocument();
  });

  it("shows Copy with summary when summary prop is provided", async () => {
    const user = userEvent.setup();
    render(
      <ShareButton {...defaultProps} summary="Great insights on AI trends" />
    );
    await user.click(screen.getByRole("button", { name: /share/i }));
    expect(screen.getByText("Copy with summary")).toBeInTheDocument();
  });

  it("copies only URL when Copy link is clicked", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(
      writeTextMock
    );

    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /share/i }));
    await user.click(screen.getByText("Copy link"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(defaultProps.url);
      expect(toast.success).toHaveBeenCalledWith("Link copied to clipboard");
    });
  });

  it("copies formatted text when Copy with summary is clicked", async () => {
    const summary = "Great insights on AI trends";
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(
      writeTextMock
    );

    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} summary={summary} />);
    await user.click(screen.getByRole("button", { name: /share/i }));
    await user.click(screen.getByText("Copy with summary"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        `${defaultProps.title}\n\n${summary}\n\n${defaultProps.url}`
      );
      expect(toast.success).toHaveBeenCalledWith("Copied to clipboard");
    });
  });

  it("calls navigator.share with correct data for native Share", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    const canShareMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "share", {
      value: shareMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, "canShare", {
      value: canShareMock,
      configurable: true,
      writable: true,
    });

    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /share/i }));

    // The dropdown will have both "Share" (native) and "Copy link"
    // Click the "Share" menu item (the native share one)
    const menuItems = screen.getAllByRole("menuitem");
    const shareItem = menuItems.find((item) =>
      item.textContent?.includes("Share")
    );
    await user.click(shareItem!);

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalledWith({
        title: defaultProps.title,
        text: defaultProps.text,
        url: defaultProps.url,
      });
    });
  });

  it("silently handles AbortError from cancelled native share", async () => {
    const abortError = new DOMException("Share cancelled", "AbortError");
    const shareMock = vi.fn().mockRejectedValue(abortError);
    const canShareMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "share", {
      value: shareMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, "canShare", {
      value: canShareMock,
      configurable: true,
      writable: true,
    });

    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /share/i }));

    const menuItems = screen.getAllByRole("menuitem");
    const shareItem = menuItems.find((item) =>
      item.textContent?.includes("Share")
    );
    await user.click(shareItem!);

    await waitFor(() => {
      expect(shareMock).toHaveBeenCalled();
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("shows toast with URL when clipboard write fails on Copy link", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("Clipboard denied")
    );

    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<ShareButton {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: /share/i }));
    await user.click(screen.getByText("Copy link"));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith("Could not copy link", {
        description: defaultProps.url,
      });
    });
  });

  it("accepts custom size and variant props", () => {
    render(<ShareButton {...defaultProps} size="sm" variant="secondary" />);
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });
});
