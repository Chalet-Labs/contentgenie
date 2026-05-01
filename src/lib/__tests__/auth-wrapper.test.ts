import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/auth-roles", () => ({ ADMIN_ROLE: "org:admin" }));

import { withAuthAction, withAdminAction } from "@/lib/auth-wrapper";

describe("withAuthAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns Unauthorized when no session", async () => {
    mockAuth.mockResolvedValue({ userId: null });
    const fn = vi.fn();
    const result = await withAuthAction(fn);
    expect(result).toEqual({ success: false, error: "Unauthorized" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("calls fn with userId when authenticated", async () => {
    mockAuth.mockResolvedValue({ userId: "user_123" });
    const fn = vi.fn().mockResolvedValue({ success: true });
    const result = await withAuthAction(fn);
    expect(fn).toHaveBeenCalledWith("user_123");
    expect(result).toEqual({ success: true });
  });
});

describe("withAdminAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns Forbidden when no session", async () => {
    mockAuth.mockResolvedValue({ userId: null, has: vi.fn() });
    const fn = vi.fn();
    const result = await withAdminAction(fn);
    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("returns Forbidden when signed in but not admin", async () => {
    const mockHas = vi.fn().mockReturnValue(false);
    mockAuth.mockResolvedValue({ userId: "user_123", has: mockHas });
    const fn = vi.fn();
    const result = await withAdminAction(fn);
    expect(result).toEqual({ success: false, error: "Forbidden" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("calls fn with userId when signed-in admin", async () => {
    const mockHas = vi.fn().mockReturnValue(true);
    mockAuth.mockResolvedValue({ userId: "admin_456", has: mockHas });
    const fn = vi.fn().mockResolvedValue({ success: true, data: "ok" });
    const result = await withAdminAction(fn);
    expect(fn).toHaveBeenCalledWith("admin_456");
    expect(result).toEqual({ success: true, data: "ok" });
  });
});
