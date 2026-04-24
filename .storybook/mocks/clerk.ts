// Stub for @clerk/nextjs in Storybook (browser context has no ClerkProvider).
// No Storybook-rendered component currently reads admin state via useAuth().has()
// — Sidebar and friends take it as a prop — so `has: () => false` is enough to
// render signed-in, non-admin views. If a future component starts gating capability
// on useAuth().has(), revisit this mock instead of relying on it to silently return
// false.
import React from "react";

export const ClerkProvider = ({ children }: { children: React.ReactNode }) =>
  children;
export const SignedIn = ({ children }: { children: React.ReactNode }) =>
  children;
export const SignedOut = ({ children }: { children: React.ReactNode }) =>
  children;
export const UserButton = () => null;
export const OrganizationSwitcher = () => null;
export const useAuth = () => ({
  isLoaded: true,
  isSignedIn: true,
  userId: "storybook-user",
  has: () => false,
});
export const useUser = () => ({
  isLoaded: true,
  isSignedIn: true,
  user: { id: "storybook-user", fullName: "Storybook User" },
});
export const auth = () => ({ userId: "storybook-user" });
