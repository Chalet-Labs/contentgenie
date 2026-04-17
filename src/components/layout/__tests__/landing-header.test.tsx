import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { LandingHeader } from "@/components/layout/landing-header"
import React from "react"

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}))

vi.mock("@clerk/nextjs", () => ({
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserButton: () => <div data-testid="user-button" />,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...rest
  }: {
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <button {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  ),
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => <div onClick={onClick}>{children}</div>,
}))

describe("LandingHeader — signed out", () => {
  it("renders logo link to /", () => {
    render(<LandingHeader />)
    const logoLink = screen.getByRole("link", { name: /contentgenie/i })
    expect(logoLink).toHaveAttribute("href", "/")
  })

  it("renders Sign In and Sign Up links when signed out", () => {
    render(<LandingHeader />)
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /sign up/i })).toBeInTheDocument()
  })

  it("does not render a hamburger or sheet trigger", () => {
    render(<LandingHeader />)
    expect(
      screen.queryByRole("button", { name: /open navigation menu/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId("sheet-trigger")).not.toBeInTheDocument()
  })

  it("does not render in-app nav links", () => {
    render(<LandingHeader />)
    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /discover/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /subscriptions/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /library/i })).not.toBeInTheDocument()
  })
})
