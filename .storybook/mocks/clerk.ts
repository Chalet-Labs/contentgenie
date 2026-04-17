// Stub for @clerk/nextjs in Storybook (browser context has no ClerkProvider)
import React from "react"

export const ClerkProvider = ({ children }: { children: React.ReactNode }) => children
export const SignedIn = ({ children }: { children: React.ReactNode }) => children
export const SignedOut = () => null
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
