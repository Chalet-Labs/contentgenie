import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Trigger.dev SDK
vi.mock("@trigger.dev/sdk", () => ({
  schedules: {
    task: vi.fn((config) => config),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock sendPushToUser from the helpers module
const mockSendPushToUser = vi.fn();
vi.mock("@/trigger/helpers/notifications", () => ({
  sendPushToUser: (...args: unknown[]) => mockSendPushToUser(...args),
}));

// Mock DB
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  users: { id: "id", preferences: "preferences" },
  notifications: {
    userId: "userId",
    isRead: "isRead",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  gt: vi.fn((...args: unknown[]) => args),
  count: vi.fn(() => "count"),
  sql: vi.fn((strings: TemplateStringsArray) => strings.join("")),
}));

import { sendNotificationDigests } from "@/trigger/send-notification-digests";

// schedules.task mock returns the raw config, so .run is available directly
const taskRunner = sendNotificationDigests as unknown as {
  run: () => Promise<{ usersProcessed: number; digestsSent: number }>;
};

describe("send-notification-digests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendPushToUser.mockResolvedValue(1);
    mockUpdate.mockReturnValue({
      set: (...args: unknown[]) => {
        mockUpdateSet(...args);
        return {
          where: (...wArgs: unknown[]) => mockUpdateWhere(...wArgs),
        };
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupSelectChain(
    digestUsers: unknown[],
    unreadCountValue: number
  ) {
    // First select: query digest users
    // Second select (per user): count unread notifications
    const unreadResult = [{ value: unreadCountValue }];

    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(digestUsers),
        }),
      })
      .mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(unreadResult),
        }),
      });
  }

  it("returns zero summary when no users have digest preferences", async () => {
    setupSelectChain([], 0);

    const result = await taskRunner.run();

    expect(result).toEqual({ usersProcessed: 0, digestsSent: 0 });
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });

  it("sends digest when user has unread notifications and window has elapsed", async () => {
    const lastDigest = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
    const digestUser = {
      id: "user-1",
      preferences: {
        digestFrequency: "daily",
        pushEnabled: true,
        lastDigestSentAt: lastDigest.toISOString(),
      },
    };
    setupSelectChain([digestUser], 3);
    mockUpdateWhere.mockResolvedValue(undefined);

    const result = await taskRunner.run();

    expect(result.digestsSent).toBe(1);
    expect(mockSendPushToUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        title: "ContentGenie Digest",
        body: "You have 3 new updates",
        tag: "digest",
        data: { url: "/dashboard" },
      })
    );
  });

  it("sends digest with singular 'update' for count of 1", async () => {
    const lastDigest = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const digestUser = {
      id: "user-1",
      preferences: {
        digestFrequency: "daily",
        pushEnabled: true,
        lastDigestSentAt: lastDigest.toISOString(),
      },
    };
    setupSelectChain([digestUser], 1);
    mockUpdateWhere.mockResolvedValue(undefined);

    await taskRunner.run();

    expect(mockSendPushToUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ body: "You have 1 new update" })
    );
  });

  it("skips user when digest window has not elapsed (daily: < 23h)", async () => {
    const lastDigest = new Date(Date.now() - 20 * 60 * 60 * 1000); // only 20h ago
    const digestUser = {
      id: "user-1",
      preferences: {
        digestFrequency: "daily",
        pushEnabled: true,
        lastDigestSentAt: lastDigest.toISOString(),
      },
    };
    setupSelectChain([digestUser], 5);

    const result = await taskRunner.run();

    expect(result.digestsSent).toBe(0);
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });

  it("skips user when digest window has not elapsed (weekly: < 6.5 days)", async () => {
    const lastDigest = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const digestUser = {
      id: "user-1",
      preferences: {
        digestFrequency: "weekly",
        pushEnabled: true,
        lastDigestSentAt: lastDigest.toISOString(),
      },
    };
    setupSelectChain([digestUser], 5);

    const result = await taskRunner.run();

    expect(result.digestsSent).toBe(0);
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });

  it("sends digest to user with no prior digest (lastDigestSentAt is null)", async () => {
    const digestUser = {
      id: "user-1",
      preferences: {
        digestFrequency: "daily",
        pushEnabled: true,
        lastDigestSentAt: null,
      },
    };
    setupSelectChain([digestUser], 2);
    mockUpdateWhere.mockResolvedValue(undefined);

    const result = await taskRunner.run();

    expect(result.digestsSent).toBe(1);
    expect(mockSendPushToUser).toHaveBeenCalled();
  });

  it("skips user with no unread notifications", async () => {
    const lastDigest = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const digestUser = {
      id: "user-1",
      preferences: {
        digestFrequency: "daily",
        pushEnabled: true,
        lastDigestSentAt: lastDigest.toISOString(),
      },
    };
    setupSelectChain([digestUser], 0); // 0 unread

    const result = await taskRunner.run();

    expect(result.digestsSent).toBe(0);
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });

  it("updates lastDigestSentAt preserving other preference fields (read-modify-write)", async () => {
    const lastDigest = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const digestUser = {
      id: "user-1",
      preferences: {
        digestFrequency: "daily",
        lastDigestSentAt: lastDigest.toISOString(),
        theme: "dark",
        pushEnabled: true,
      },
    };
    setupSelectChain([digestUser], 1);
    mockUpdateWhere.mockResolvedValue(undefined);

    await taskRunner.run();

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({
          digestFrequency: "daily",
          theme: "dark",
          pushEnabled: true,
          lastDigestSentAt: expect.any(String),
        }),
      })
    );
  });

  it("skips user when pushEnabled is false even with digest frequency and unread notifications", async () => {
    const lastDigest = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const digestUser = {
      id: "user-1",
      preferences: {
        digestFrequency: "daily",
        lastDigestSentAt: lastDigest.toISOString(),
        pushEnabled: false,
      },
    };
    setupSelectChain([digestUser], 5);

    const result = await taskRunner.run();

    expect(result.digestsSent).toBe(0);
    expect(mockSendPushToUser).not.toHaveBeenCalled();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("skips digest state update when sendPushToUser delivers zero pushes", async () => {
    const lastDigest = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const digestUser = {
      id: "user-1",
      preferences: {
        digestFrequency: "daily",
        pushEnabled: true,
        lastDigestSentAt: lastDigest.toISOString(),
      },
    };
    setupSelectChain([digestUser], 3);
    mockSendPushToUser.mockResolvedValueOnce(0); // No push subscriptions

    const result = await taskRunner.run();

    expect(result.digestsSent).toBe(0);
    expect(mockSendPushToUser).toHaveBeenCalled();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("processes multiple users independently and isolates errors", async () => {
    const lastDigest = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const users = [
      {
        id: "user-1",
        preferences: {
          digestFrequency: "daily",
          pushEnabled: true,
          lastDigestSentAt: lastDigest.toISOString(),
        },
      },
      {
        id: "user-2",
        preferences: {
          digestFrequency: "daily",
          pushEnabled: true,
          lastDigestSentAt: lastDigest.toISOString(),
        },
      },
    ];

    // First select returns both users
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(users),
        }),
      })
      // user-1 unread count
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 2 }]),
        }),
      })
      // user-2 unread count
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 1 }]),
        }),
      });

    // user-1 push fails, user-2 succeeds
    mockSendPushToUser
      .mockRejectedValueOnce(new Error("Push failed"))
      .mockResolvedValueOnce(1);

    mockUpdateWhere.mockResolvedValue(undefined);

    const result = await taskRunner.run();

    // user-1 errored so no digest sent; user-2 succeeded
    expect(result.usersProcessed).toBe(2);
    expect(result.digestsSent).toBe(1);
  });
});
