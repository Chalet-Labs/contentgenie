import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketingHeader } from "@/components/layout/marketing-header";
import React from "react";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => ({
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserButton: () => <div data-testid="user-button" />,
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignUpButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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
