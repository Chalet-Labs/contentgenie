import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallBanner } from "@/components/pwa/install-banner";

const mockPromptInstall = vi.fn().mockResolvedValue(true);
const mockDismiss = vi.fn();

vi.mock("@/hooks/use-pwa-install", () => ({
  usePwaInstall: () => ({
    canInstall: mockCanInstall,
    isInstalled: false,
    promptInstall: mockPromptInstall,
    dismiss: mockDismiss,
  }),
}));

let mockCanInstall = false;

afterEach(() => {
  vi.clearAllMocks();
  mockCanInstall = false;
});

describe("InstallBanner", () => {
  it("renders nothing when canInstall is false", () => {
    mockCanInstall = false;
    const { container } = render(<InstallBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("renders banner when canInstall is true", () => {
    mockCanInstall = true;
    render(<InstallBanner />);

    expect(screen.getByText("Install ContentGenie")).toBeInTheDocument();
    expect(
      screen.getByText("Get the full app experience"),
    ).toBeInTheDocument();
  });

  it("calls promptInstall when Install button is clicked", async () => {
    mockCanInstall = true;
    const user = userEvent.setup();
    render(<InstallBanner />);

    await user.click(screen.getByRole("button", { name: "Install" }));
    expect(mockPromptInstall).toHaveBeenCalledOnce();
  });

  it("calls dismiss when X button is clicked", async () => {
    mockCanInstall = true;
    const user = userEvent.setup();
    render(<InstallBanner />);

    await user.click(
      screen.getByRole("button", { name: "Dismiss install banner" }),
    );
    expect(mockDismiss).toHaveBeenCalledOnce();
  });

  it("has correct ARIA attributes", () => {
    mockCanInstall = true;
    render(<InstallBanner />);

    const banner = screen.getByRole("complementary");
    expect(banner).toHaveAttribute("aria-label", "Install app");
  });

  it("has md:hidden class for desktop hiding", () => {
    mockCanInstall = true;
    render(<InstallBanner />);

    const banner = screen.getByRole("complementary");
    expect(banner.className).toContain("md:hidden");
  });
});
