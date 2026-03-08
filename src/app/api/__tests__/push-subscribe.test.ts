import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/db/schema", () => ({
  pushSubscriptions: {
    endpoint: "endpoint",
    userId: "userId",
  },
}));

const mockInsert = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { POST } = await import("@/app/api/push/subscribe/route");
    const request = new NextRequest("http://localhost:3000/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({
        endpoint: "https://fcm.googleapis.com/fcm/send/test-sub-1",
        keys: { p256dh: "key", auth: "auth" },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 403 when X-Requested-With header is missing", async () => {
    const { POST } = await import("@/app/api/push/subscribe/route");
    const request = new NextRequest("http://localhost:3000/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://fcm.googleapis.com/fcm/send/test-sub-1",
        keys: { p256dh: "key", auth: "auth" },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("returns 400 for missing endpoint", async () => {
    const { POST } = await import("@/app/api/push/subscribe/route");
    const request = new NextRequest("http://localhost:3000/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
      },
      body: JSON.stringify({ keys: { p256dh: "key", auth: "auth" } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 for missing keys", async () => {
    const { POST } = await import("@/app/api/push/subscribe/route");
    const request = new NextRequest("http://localhost:3000/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
      },
      body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/test-sub-1" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("upserts push subscription on valid request", async () => {
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockReturnValue({
      onConflictDoUpdate: mockOnConflict,
    });
    mockInsert.mockReturnValue({ values: mockValues });

    const { POST } = await import("@/app/api/push/subscribe/route");
    const request = new NextRequest("http://localhost:3000/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
      },
      body: JSON.stringify({
        endpoint: "https://fcm.googleapis.com/fcm/send/test-sub-1",
        keys: { p256dh: "key123", auth: "auth123" },
        userAgent: "TestBrowser/1.0",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockInsert).toHaveBeenCalled();
  });
});

describe("DELETE /api/push/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { DELETE } = await import("@/app/api/push/subscribe/route");
    const request = new NextRequest("http://localhost:3000/api/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/test-sub-1" }),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(401);
  });

  it("returns 403 when X-Requested-With header is missing", async () => {
    const { DELETE } = await import("@/app/api/push/subscribe/route");
    const request = new NextRequest("http://localhost:3000/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/test-sub-1" }),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(403);
  });

  it("returns 400 for missing endpoint", async () => {
    const { DELETE } = await import("@/app/api/push/subscribe/route");
    const request = new NextRequest("http://localhost:3000/api/push/subscribe", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
      },
      body: JSON.stringify({}),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);
  });

  it("deletes push subscription for authenticated user", async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    mockDelete.mockReturnValue({ where: mockWhere });

    const { DELETE } = await import("@/app/api/push/subscribe/route");
    const request = new NextRequest("http://localhost:3000/api/push/subscribe", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "fetch",
      },
      body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/test-sub-1" }),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
  });
});
