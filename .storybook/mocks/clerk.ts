// Stub for @clerk/nextjs in Storybook (browser context has no ClerkProvider).
// Admin state flows through component props (e.g. Sidebar's `isAdmin` prop) rather
// than through useAuth().has(), so the mock simply reports a signed-in non-admin user.
import React from "react"

export const ClerkProvider = ({ children }: { children: React.ReactNode }) => children
export const SignedIn = ({ children }: { children: React.ReactNode }) => children
export const SignedOut = ({ children }: { children: React.ReactNode }) => children
export const UserButton = () => null
export const OrganizationSwitcher = () => null
export const useAuth = () => ({
  isLoaded: true,
  isSignedIn: true,
  userId: "storybook-user",
  has: () => false,
})
export const useUser = () => ({
  isLoaded: true,
  isSignedIn: true,
  user: { id: "storybook-user", fullName: "Storybook User" },
})
export const auth = () => ({ userId: "storybook-user" })
