import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const { setThemeMock, themeState, clerkState } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
  themeState: { resolvedTheme: "light" as "light" | "dark" },
  clerkState: { signedIn: false },
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: themeState.resolvedTheme,
    setTheme: setThemeMock,
  }),
}));

vi.mock("@clerk/nextjs", () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    clerkState.signedIn ? <>{children}</> : null,
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    clerkState.signedIn ? null : <>{children}</>,
  UserButton: () => <div data-testid="user-button" />,
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignUpButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { MarketingHeader } from "@/components/layout/marketing-header";

beforeEach(() => {
  setThemeMock.mockClear();
  themeState.resolvedTheme = "light";
  clerkState.signedIn = false;
});

describe("MarketingHeader — signed out", () => {
  it("renders brand link to /", () => {
    render(<MarketingHeader />);
    const brand = screen.getByRole("link", { name: /contentgenie/i });
    expect(brand).toHaveAttribute("href", "/");
  });

  it("renders Sign in and Join beta CTAs when signed out", () => {
    render(<MarketingHeader />);
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join beta/i })).toBeInTheDocument();
  });

  it("renders marketing nav links with absolute hrefs", () => {
    render(<MarketingHeader />);
    expect(screen.getByRole("link", { name: /product/i })).toHaveAttribute("href", "/#product");
    expect(screen.getByRole("link", { name: /how it works/i })).toHaveAttribute("href", "/#how");
    expect(screen.getByRole("link", { name: /example/i })).toHaveAttribute("href", "/#example");
    expect(screen.getByRole("link", { name: /pricing/i })).toHaveAttribute("href", "/#pricing");
  });

  it("does not render in-app nav links", () => {
    render(<MarketingHeader />);
    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /discover/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /library/i })).not.toBeInTheDocument();
  });
});

describe("MarketingHeader — theme toggle", () => {
  it("flips to dark when current theme is light", () => {
    themeState.resolvedTheme = "light";
    render(<MarketingHeader />);
    fireEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });

  it("flips to light when current theme is dark", () => {
    themeState.resolvedTheme = "dark";
    render(<MarketingHeader />);
    fireEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });
});

describe("MarketingHeader — signed in", () => {
  it("renders the Open app link to /dashboard and UserButton", () => {
    clerkState.signedIn = true;
    render(<MarketingHeader />);
    const openApp = screen.getByRole("link", { name: /open app/i });
    expect(openApp).toHaveAttribute("href", "/dashboard");
    expect(screen.getByTestId("user-button")).toBeInTheDocument();
  });

  it("does not render signed-out CTAs", () => {
    clerkState.signedIn = true;
    render(<MarketingHeader />);
    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /join beta/i })).not.toBeInTheDocument();
  });
});
