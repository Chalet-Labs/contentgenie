import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConsume = vi.fn();

vi.mock("rate-limiter-flexible", () => ({
  RateLimiterPostgres: class {
    consume = mockConsume;
    constructor(_opts: unknown, cb?: (err?: Error) => void) {
      // Defer callback so the constructor assignment completes first
      if (cb) queueMicrotask(() => cb());
    }
  },
  RateLimiterMemory: class {},
}));

vi.mock("@neondatabase/serverless", () => ({
  Pool: class {},
}));

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost/test");
    mockConsume.mockReset();
  });

  it("returns allowed: true when consume succeeds", async () => {
    mockConsume.mockResolvedValue({ remainingPoints: 9 });
    const { checkRateLimit } = await import("@/lib/rate-limit");

    const result = await checkRateLimit("user-1");

    expect(result).toEqual({ allowed: true });
    expect(mockConsume).toHaveBeenCalledWith("user-1", 1);
  });

  it("returns allowed: false with retryAfterMs when rate limited", async () => {
    mockConsume.mockRejectedValue({ msBeforeNext: 30000 });
    const { checkRateLimit } = await import("@/lib/rate-limit");

    const result = await checkRateLimit("user-2");

    expect(result).toEqual({ allowed: false, retryAfterMs: 30000 });
  });

  it("uses custom points parameter for batch usage", async () => {
    mockConsume.mockResolvedValue({ remainingPoints: 5 });
    const { checkRateLimit } = await import("@/lib/rate-limit");

    const result = await checkRateLimit("user-3", 5);

    expect(result).toEqual({ allowed: true });
    expect(mockConsume).toHaveBeenCalledWith("user-3", 5);
  });

  it("re-throws unexpected errors", async () => {
    mockConsume.mockRejectedValue(new Error("connection failed"));
    const { checkRateLimit } = await import("@/lib/rate-limit");

    await expect(checkRateLimit("user-4")).rejects.toThrow("connection failed");
  });
});
