import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineBanner } from "@/components/ui/offline-banner";

describe("OfflineBanner", () => {
  it("renders banner when isOffline is true", () => {
    render(<OfflineBanner isOffline={true} />);

    const banner = screen.getByRole("status");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("Offline mode");
    expect(banner).toHaveTextContent("showing cached data");
  });

  it("renders nothing when isOffline is false", () => {
    const { container } = render(<OfflineBanner isOffline={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("contains the WifiOff icon", () => {
    render(<OfflineBanner isOffline={true} />);
    const banner = screen.getByRole("status");
    // lucide-react renders SVG elements
    const svg = banner.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("has appropriate role for accessibility", () => {
    render(<OfflineBanner isOffline={true} />);
    const banner = screen.getByRole("status");
    expect(banner.getAttribute("role")).toBe("status");
  });
});
