import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockAuth = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@/components/layout/marketing-header", () => ({
  MarketingHeader: () => <div data-testid="marketing-header" />,
}));

import EpisodeLayout from "@/app/(episode)/episode/[id]/layout";

describe("EpisodeLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the public shell for anonymous viewers", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const result = await EpisodeLayout({ children: <div>episode content</div> });
    render(result as React.ReactElement);

    expect(screen.getByTestId("marketing-header")).toBeInTheDocument();
    expect(screen.getByText("episode content")).toBeInTheDocument();
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
  });

  it("renders AppShell for authenticated viewers", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" });

    const result = await EpisodeLayout({ children: <div>episode content</div> });
    render(result as React.ReactElement);

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getByText("episode content")).toBeInTheDocument();
    expect(screen.queryByTestId("marketing-header")).not.toBeInTheDocument();
  });
});
