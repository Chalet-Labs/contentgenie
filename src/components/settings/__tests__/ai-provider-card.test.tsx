import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock Clerk
const mockUseUser = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useUser: () => mockUseUser(),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock server actions
const mockGetAiConfig = vi.fn();
const mockUpdateAiConfig = vi.fn();
vi.mock("@/app/actions/ai-config", () => ({
  getAiConfig: (...args: unknown[]) => mockGetAiConfig(...args),
  updateAiConfig: (...args: unknown[]) => mockUpdateAiConfig(...args),
}));

import { toast } from "sonner";
import { AiProviderCard } from "@/components/settings/ai-provider-card";

describe("AiProviderCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAiConfig.mockResolvedValue({
      config: { provider: "openrouter", model: "google/gemini-2.0-flash-001" },
    });
    mockUpdateAiConfig.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing for non-admin users", () => {
    mockUseUser.mockReturnValue({
      user: { organizationMemberships: [{ role: "org:member" }] },
      isLoaded: true,
    });

    const { container } = render(<AiProviderCard />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when user has no organization memberships", () => {
    mockUseUser.mockReturnValue({
      user: { organizationMemberships: [] },
      isLoaded: true,
    });

    const { container } = render(<AiProviderCard />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing while user is loading", () => {
    mockUseUser.mockReturnValue({ user: null, isLoaded: false });

    const { container } = render(<AiProviderCard />);
    expect(container.innerHTML).toBe("");
  });

  it("renders card for admin users", async () => {
    mockUseUser.mockReturnValue({
      user: { organizationMemberships: [{ role: "org:admin" }] },
      isLoaded: true,
    });

    render(<AiProviderCard />);

    expect(screen.getByText("AI Provider")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Configure the AI provider and model used for episode summarization."
      )
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetAiConfig).toHaveBeenCalledOnce();
    });
  });

  it("loads current config on mount", async () => {
    mockUseUser.mockReturnValue({
      user: { organizationMemberships: [{ role: "org:admin" }] },
      isLoaded: true,
    });

    render(<AiProviderCard />);

    await waitFor(() => {
      expect(mockGetAiConfig).toHaveBeenCalledOnce();
    });
  });

  it("calls updateAiConfig on save and shows success toast", async () => {
    mockUseUser.mockReturnValue({
      user: { organizationMemberships: [{ role: "org:admin" }] },
      isLoaded: true,
    });

    render(<AiProviderCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    const saveButton = screen.getByRole("button", { name: "Save" });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateAiConfig).toHaveBeenCalledWith(
        "openrouter",
        "google/gemini-2.0-flash-001"
      );
      expect(toast.success).toHaveBeenCalledWith(
        "AI provider configuration saved"
      );
    });
  });

  it("shows error toast on save failure", async () => {
    mockUseUser.mockReturnValue({
      user: { organizationMemberships: [{ role: "org:admin" }] },
      isLoaded: true,
    });
    mockUpdateAiConfig.mockResolvedValue({
      success: false,
      error: "Admin access required",
    });

    render(<AiProviderCard />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    const saveButton = screen.getByRole("button", { name: "Save" });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Admin access required");
    });
  });
});
