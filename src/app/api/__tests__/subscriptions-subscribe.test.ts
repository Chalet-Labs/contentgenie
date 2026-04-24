import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeClerkAuthMock } from "@/test/mocks/clerk-server";
import { makePostRequest } from "@/test/mocks/next-request";

const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => makeClerkAuthMock(() => mockAuth()));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/db/schema", () => ({
  users: {},
  podcasts: { podcastIndexId: "podcastIndexId", id: "id" },
  userSubscriptions: { id: "id" },
}));

const mockInsert = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

const validPodcastPayload = {
  podcastIndexId: "pod-456",
  title: "Test Podcast",
  description: "A podcast",
  imageUrl: "https://example.com/art.jpg",
};

function setupInsertChains({
  podcastId = 10,
  subResult = [{ id: 5 }],
}: {
  podcastId?: number;
  subResult?: Array<{ id: number }>;
} = {}) {
  let callCount = 0;
  mockInsert.mockImplementation(() => {
    callCount++;
    switch (callCount) {
      case 1: // users (onConflictDoUpdate when email non-empty, onConflictDoNothing otherwise)
        return {
          values: vi.fn().mockReturnThis(),
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        };
      case 2: // podcasts (updateOnConflict: "safe" → onConflictDoUpdate with safe fields)
        return {
          values: vi.fn().mockReturnThis(),
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: podcastId }]),
          }),
        };
      case 3: // userSubscriptions
      default:
        return {
          values: vi.fn().mockReturnThis(),
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(subResult),
          }),
        };
    }
  });
}

describe("POST /api/subscriptions/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    setupInsertChains();
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { POST } = await import("@/app/api/subscriptions/subscribe/route");
    const response = await POST(
      makePostRequest("/api/subscriptions/subscribe", validPodcastPayload),
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it("returns 400 for missing podcastIndexId", async () => {
    const { POST } = await import("@/app/api/subscriptions/subscribe/route");
    const response = await POST(
      makePostRequest("/api/subscriptions/subscribe", { title: "Test" }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  it("returns 400 for missing title", async () => {
    const { POST } = await import("@/app/api/subscriptions/subscribe/route");
    const response = await POST(
      makePostRequest("/api/subscriptions/subscribe", {
        podcastIndexId: "pod-1",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 415 for missing Content-Type", async () => {
    const { POST } = await import("@/app/api/subscriptions/subscribe/route");
    const response = await POST(
      new NextRequest("http://localhost:3000/api/subscriptions/subscribe", {
        method: "POST",
        body: "not-json",
      }),
    );

    expect(response.status).toBe(415);
  });

  it("returns 200 with success:true for valid payload", async () => {
    const { POST } = await import("@/app/api/subscriptions/subscribe/route");
    const response = await POST(
      makePostRequest("/api/subscriptions/subscribe", validPodcastPayload),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it("returns success with 'already subscribed' message when already subscribed", async () => {
    setupInsertChains({ subResult: [] }); // empty = already subscribed

    const { POST } = await import("@/app/api/subscriptions/subscribe/route");
    const response = await POST(
      makePostRequest("/api/subscriptions/subscribe", validPodcastPayload),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/already/i);
  });

  it("returns 500 on DB error", async () => {
    let callCount = 0;
    mockInsert.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          values: vi.fn().mockReturnThis(),
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        };
      }
      return {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error("DB error")),
        }),
      };
    });

    const { POST } = await import("@/app/api/subscriptions/subscribe/route");
    const response = await POST(
      makePostRequest("/api/subscriptions/subscribe", validPodcastPayload),
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(JSON.stringify(data)).not.toContain("DB error");
  });
});
