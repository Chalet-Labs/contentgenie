import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallAppCard } from "@/components/settings/install-app-card";

const mockPromptInstall = vi.fn().mockResolvedValue(true);
const mockDismiss = vi.fn();

const originalMaxTouchPoints = navigator.maxTouchPoints;
const originalPlatform = navigator.platform;

let hookReturn = {
  canInstall: false,
  isInstalled: false,
  promptInstall: mockPromptInstall,
  dismiss: mockDismiss,
};

vi.mock("@/hooks/use-pwa-install", () => ({
  usePwaInstall: () => hookReturn,
}));

beforeEach(() => {
  hookReturn = {
    canInstall: false,
    isInstalled: false,
    promptInstall: mockPromptInstall,
    dismiss: mockDismiss,
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "maxTouchPoints", {
    value: originalMaxTouchPoints,
    configurable: true,
  });
  Object.defineProperty(navigator, "platform", {
    value: originalPlatform,
    configurable: true,
  });
});

describe("InstallAppCard", () => {
  it("renders 'Installed' badge when isInstalled is true", () => {
    hookReturn.isInstalled = true;
    render(<InstallAppCard />);

    expect(screen.getByText("Installed")).toBeInTheDocument();
  });

  it("renders Install button when canInstall is true", () => {
    hookReturn.canInstall = true;
    render(<InstallAppCard />);

    expect(
      screen.getByRole("button", { name: "Install" }),
    ).toBeInTheDocument();
  });

  it("Install button calls promptInstall", async () => {
    hookReturn.canInstall = true;
    const user = userEvent.setup();
    render(<InstallAppCard />);

    await user.click(screen.getByRole("button", { name: "Install" }));
    expect(mockPromptInstall).toHaveBeenCalledOnce();
  });

  it("renders iOS instructions when UA contains iPhone", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    );

    render(<InstallAppCard />);

    expect(screen.getByText(/Share/)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it("renders iOS instructions when platform is MacIntel with touch", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    );
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: 5,
      configurable: true,
    });

    render(<InstallAppCard />);

    expect(screen.getByText(/Share/)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });

  it("renders 'not available' message on other browsers", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0",
    );
    Object.defineProperty(navigator, "platform", {
      value: "Linux x86_64",
      configurable: true,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: 0,
      configurable: true,
    });

    render(<InstallAppCard />);

    expect(
      screen.getByText("Install is not available on this browser."),
    ).toBeInTheDocument();
  });
});
