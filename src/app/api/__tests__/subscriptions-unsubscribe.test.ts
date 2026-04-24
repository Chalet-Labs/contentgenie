import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/db/schema", () => ({
  podcasts: { podcastIndexId: "podcastIndexId", id: "id" },
  userSubscriptions: { userId: "userId", podcastId: "podcastId" },
}));

const mockPodcastsFindFirst = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      podcasts: {
        findFirst: (...args: unknown[]) => mockPodcastsFindFirst(...args),
      },
    },
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

function makeRequest(body: unknown) {
  return new NextRequest(
    "http://localhost:3000/api/subscriptions/unsubscribe",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("POST /api/subscriptions/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockPodcastsFindFirst.mockResolvedValue({ id: 10 });
    mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { POST } = await import("@/app/api/subscriptions/unsubscribe/route");
    const response = await POST(makeRequest({ podcastIndexId: "pod-456" }));

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it("returns 400 for missing podcastIndexId", async () => {
    const { POST } = await import("@/app/api/subscriptions/unsubscribe/route");
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it("returns 400 for non-string podcastIndexId", async () => {
    const { POST } = await import("@/app/api/subscriptions/unsubscribe/route");
    const response = await POST(makeRequest({ podcastIndexId: 456 }));

    expect(response.status).toBe(400);
  });

  it("returns 415 for missing Content-Type", async () => {
    const { POST } = await import("@/app/api/subscriptions/unsubscribe/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/subscriptions/unsubscribe", {
        method: "POST",
        body: "not-json",
      }),
    );

    expect(response.status).toBe(415);
  });

  it("returns 404 when podcast not found", async () => {
    mockPodcastsFindFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/subscriptions/unsubscribe/route");
    const response = await POST(
      makeRequest({ podcastIndexId: "pod-nonexistent" }),
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it("returns 200 with success:true on valid unsubscribe", async () => {
    const { POST } = await import("@/app/api/subscriptions/unsubscribe/route");
    const response = await POST(makeRequest({ podcastIndexId: "pod-456" }));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it("calls db.delete", async () => {
    const { POST } = await import("@/app/api/subscriptions/unsubscribe/route");
    await POST(makeRequest({ podcastIndexId: "pod-456" }));

    expect(mockDelete).toHaveBeenCalled();
  });

  it("returns 500 on DB error without leaking details", async () => {
    mockPodcastsFindFirst.mockRejectedValue(new Error("DB connection failed"));

    const { POST } = await import("@/app/api/subscriptions/unsubscribe/route");
    const response = await POST(makeRequest({ podcastIndexId: "pod-456" }));

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(JSON.stringify(data)).not.toContain("DB connection failed");
  });
});
