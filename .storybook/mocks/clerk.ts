// Stub for @clerk/nextjs in Storybook (browser context has no ClerkProvider).
// Per-story admin state is toggled via setStorybookIsAdmin() so WithAdmin /
// InSheetWithAdmin decorators can demonstrate the admin branch.
import React from "react"
import { ADMIN_ROLE } from "../../src/lib/auth-roles"

let isAdminMock = false

export const setStorybookIsAdmin = (value: boolean) => {
  isAdminMock = value
}

export const ClerkProvider = ({ children }: { children: React.ReactNode }) => children
export const SignedIn = ({ children }: { children: React.ReactNode }) => children
export const SignedOut = ({ children }: { children: React.ReactNode }) => children
export const UserButton = () => null
export const OrganizationSwitcher = () => null
export const useAuth = () => ({
  isLoaded: true,
  isSignedIn: true,
  userId: "storybook-user",
  has: ({ role }: { role?: string } = {}) =>
    isAdminMock && role === ADMIN_ROLE,
})
export const useUser = () => ({
  isLoaded: true,
  isSignedIn: true,
  user: { id: "storybook-user", fullName: "Storybook User" },
})
export const auth = () => ({ userId: "storybook-user" })
