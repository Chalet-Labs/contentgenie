import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockAuth = vi.fn();
const mockRedirect = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
  usePathname: () => "/admin",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("@/components/admin/admin-tab-nav", () => ({
  AdminTabNav: () => <nav data-testid="admin-tab-nav" />,
}));

import AdminLayout from "@/app/(app)/admin/layout";

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects non-admin users to /dashboard", async () => {
    mockAuth.mockResolvedValue({ has: () => false });
    await AdminLayout({ children: <div>content</div> });
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("renders children for admin users", async () => {
    mockAuth.mockResolvedValue({ has: () => true });
    const result = await AdminLayout({ children: <div>admin content</div> });
    render(result as React.ReactElement);
    expect(screen.getByText("admin content")).toBeInTheDocument();
    expect(screen.getByTestId("admin-tab-nav")).toBeInTheDocument();
  });
});
