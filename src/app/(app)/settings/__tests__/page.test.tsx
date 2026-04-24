import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      primaryEmailAddress: { emailAddress: "test@example.com" },
      externalAccounts: [],
    },
  }),
  useClerk: () => ({ openUserProfile: vi.fn() }),
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "test-user-id",
    has: vi.fn(),
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "system",
    setTheme: vi.fn(),
    resolvedTheme: "light",
  }),
}));

vi.mock("@/components/settings/install-app-card", () => ({
  InstallAppCard: () => <div data-testid="install-app-card" />,
}));

vi.mock("@/components/notifications/notification-settings", () => ({
  NotificationSettings: () => <div data-testid="notification-settings" />,
}));

import SettingsPage from "@/app/(app)/settings/page";

describe("SettingsPage", () => {
  it("does not render AiProviderCard", () => {
    render(<SettingsPage />);
    // The heading for the AI provider card would be "AI Provider"
    expect(screen.queryByText(/ai provider/i)).not.toBeInTheDocument();
  });

  it("does not render BulkResummarizeCard", () => {
    render(<SettingsPage />);
    expect(screen.queryByText(/bulk resummariz/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/re-summarize/i)).not.toBeInTheDocument();
  });

  it("does not render MissingTranscriptsCard", () => {
    render(<SettingsPage />);
    expect(screen.queryByText(/missing transcripts/i)).not.toBeInTheDocument();
  });

  it("still renders Appearance section", () => {
    render(<SettingsPage />);
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });

  it("still renders Danger Zone section", () => {
    render(<SettingsPage />);
    expect(screen.getByText("Danger Zone")).toBeInTheDocument();
  });
});
