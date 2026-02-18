import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { auth as clerkAuth } from "@clerk/nextjs/server";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

const mockRateLimitFn = vi.fn().mockResolvedValue({ allowed: true });
vi.mock("@/lib/rate-limit", () => ({
  createRateLimitChecker: vi.fn(() => mockRateLimitFn),
}));

const mockDbSelectWhere = vi.fn().mockResolvedValue([{ count: 10 }]);
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: (...args: unknown[]) => mockDbSelectWhere(...args),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  episodes: {
    processedAt: "processed_at",
    podcastId: "podcast_id",
    publishDate: "publish_date",
    worthItScore: "worth_it_score",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  isNotNull: vi.fn(),
  lte: vi.fn(),
  gte: vi.fn(),
  eq: vi.fn(),
  count: vi.fn(() => "count(*)"),
}));

vi.mock("@trigger.dev/sdk", () => ({
  tasks: {
    trigger: vi.fn().mockResolvedValue({ id: "run_bulk123" }),
  },
  auth: {
    createPublicToken: vi.fn().mockResolvedValue("test-public-token"),
  },
  runs: {
    cancel: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/trigger/bulk-resummarize", () => ({}));

function makeRequest(method: string, body: unknown) {
  return new NextRequest(
    `http://localhost:3000/api/episodes/bulk-resummarize`,
    {
      method,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }
  );
}

describe("POST /api/episodes/bulk-resummarize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clerkAuth).mockResolvedValue({ userId: "user-1" } as never);
    mockRateLimitFn.mockResolvedValue({ allowed: true });
    mockDbSelectWhere.mockResolvedValue([{ count: 10 }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(clerkAuth).mockResolvedValue({ userId: null } as never);

    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { all: true }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when no filter and all is not true", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", {}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/filter.*required|all.*true/i);
  });

  it("returns 400 when all is false and no filter", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { all: false }));
    const data = await response.json();

    expect(response.status).toBe(400);
  });

  it("returns 400 when podcastId is negative", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { podcastId: -1 }));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toMatch(/podcastId/i);
  });

  it("returns 400 when podcastId is zero", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { podcastId: 0 }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when podcastId is a non-integer float", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { podcastId: 1.5 }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when minDate is not a valid ISO string", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { minDate: "not-a-date" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/minDate/i);
  });

  it("returns 400 when maxDate is not a valid ISO string", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { maxDate: "invalid" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/maxDate/i);
  });

  it("returns 400 when maxScore is out of range", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");

    const highResponse = await POST(makeRequest("POST", { maxScore: 11 }));
    expect(highResponse.status).toBe(400);
    const highData = await highResponse.json();
    expect(highData.error).toMatch(/maxScore/i);

    const lowResponse = await POST(makeRequest("POST", { maxScore: -1 }));
    expect(lowResponse.status).toBe(400);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockRateLimitFn.mockResolvedValue({ allowed: false, retryAfterMs: 3600000 });

    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { all: true }));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toMatch(/rate limit/i);
  });

  it("returns 202 with runId, publicAccessToken and estimatedEpisodes on success", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { all: true }));
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.runId).toBe("run_bulk123");
    expect(data.publicAccessToken).toBe("test-public-token");
    expect(typeof data.estimatedEpisodes).toBe("number");
  });

  it("accepts request with all: true and no other filters", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { all: true }));

    expect(response.status).toBe(202);
  });

  it("accepts request with a valid podcastId filter", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { podcastId: 5 }));

    expect(response.status).toBe(202);
  });

  it("accepts request with date range filters", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", {
      minDate: "2024-01-01",
      maxDate: "2024-12-31",
    }));

    expect(response.status).toBe(202);
  });

  it("accepts request with maxScore filter", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { maxScore: 5 }));

    expect(response.status).toBe(202);
  });

  it("accepts maxScore of 0 (boundary value)", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { maxScore: 0 }));

    expect(response.status).toBe(202);
  });

  it("accepts maxScore of 10 (boundary value)", async () => {
    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { maxScore: 10 }));

    expect(response.status).toBe(202);
  });

  it("triggers the bulk-resummarize task with correct payload", async () => {
    const { tasks } = await import("@trigger.dev/sdk");

    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    await POST(makeRequest("POST", { podcastId: 7, maxScore: 5 }));

    expect(tasks.trigger).toHaveBeenCalledWith(
      "bulk-resummarize",
      expect.objectContaining({ podcastId: 7, maxScore: 5 })
    );
  });

  describe("dynamic token expiry calculation", () => {
    it("uses minimum 15 minutes for 0 episodes", async () => {
      mockDbSelectWhere.mockResolvedValue([{ count: 0 }]);

      const { auth } = await import("@trigger.dev/sdk");
      const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
      await POST(makeRequest("POST", { all: true }));

      expect(auth.createPublicToken).toHaveBeenCalledWith(
        expect.objectContaining({ expirationTime: "15m" })
      );
    });

    it("uses maximum 60 minutes for very large episode counts", async () => {
      mockDbSelectWhere.mockResolvedValue([{ count: 10000 }]);

      const { auth } = await import("@trigger.dev/sdk");
      const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
      await POST(makeRequest("POST", { all: true }));

      expect(auth.createPublicToken).toHaveBeenCalledWith(
        expect.objectContaining({ expirationTime: "60m" })
      );
    });

    it("scales token expiry proportionally for medium episode counts", async () => {
      // 45 episodes / 3 concurrent * 2 min = 30 min
      // Math.min(60, Math.max(15, Math.ceil(45 / 3 * 2))) = 30
      mockDbSelectWhere.mockResolvedValue([{ count: 45 }]);

      const { auth } = await import("@trigger.dev/sdk");
      const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
      await POST(makeRequest("POST", { all: true }));

      expect(auth.createPublicToken).toHaveBeenCalledWith(
        expect.objectContaining({ expirationTime: "30m" })
      );
    });
  });

  it("returns 500 when an unexpected error occurs", async () => {
    mockDbSelectWhere.mockRejectedValue(new Error("DB connection failed"));

    const { POST } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await POST(makeRequest("POST", { all: true }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toMatch(/failed.*trigger/i);
  });
});

describe("DELETE /api/episodes/bulk-resummarize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clerkAuth).mockResolvedValue({ userId: "user-1" } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(clerkAuth).mockResolvedValue({ userId: null } as never);

    const { DELETE } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await DELETE(makeRequest("DELETE", { runId: "run_abc" }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when runId is missing", async () => {
    const { DELETE } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await DELETE(makeRequest("DELETE", {}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/runId/i);
  });

  it("returns 400 when runId is not a string", async () => {
    const { DELETE } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await DELETE(makeRequest("DELETE", { runId: 12345 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toMatch(/runId/i);
  });

  it("cancels the run and returns { canceled: true }", async () => {
    const { runs } = await import("@trigger.dev/sdk");

    const { DELETE } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await DELETE(makeRequest("DELETE", { runId: "run_abc123" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.canceled).toBe(true);
    expect(runs.cancel).toHaveBeenCalledWith("run_abc123");
  });

  it("returns 500 when runs.cancel throws", async () => {
    const sdkModule = await import("@trigger.dev/sdk");
    vi.mocked(sdkModule.runs.cancel).mockRejectedValueOnce(new Error("Run not found"));

    const { DELETE } = await import("@/app/api/episodes/bulk-resummarize/route");
    const response = await DELETE(makeRequest("DELETE", { runId: "run_bad" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toMatch(/cancel/i);
  });
});
