// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock Clerk auth
const mockAuth = vi.fn();
const mockCurrentUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  currentUser: (...args: unknown[]) => mockCurrentUser(...args),
}));

// Mock the rate limiter module — checker must survive clearAllMocks
const mockCheckRateLimit = vi.fn().mockResolvedValue({ allowed: true });
vi.mock("@/lib/rate-limit", () => ({
  createRateLimitChecker: () => (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// Mock OPML parser
const mockParseOpml = vi.fn();
vi.mock("@/lib/opml", () => ({
  parseOpml: (...args: unknown[]) => mockParseOpml(...args),
}));

// Mock database
const mockWhere = vi.fn();
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: (...wArgs: unknown[]) => mockWhere(...wArgs),
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  podcasts: { id: "id", rssFeedUrl: "rss_feed_url" },
  userSubscriptions: { podcastId: "podcast_id", userId: "user_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

const mockTrigger = vi.fn().mockResolvedValue({ id: "run_opml123" });
const mockCreatePublicToken = vi.fn().mockResolvedValue("test-opml-token");
vi.mock("@trigger.dev/sdk", () => ({
  tasks: {
    trigger: (...args: unknown[]) => mockTrigger(...args),
  },
  auth: {
    createPublicToken: (...args: unknown[]) => mockCreatePublicToken(...args),
  },
}));

vi.mock("@/trigger/import-opml", () => ({}));

import { POST } from "@/app/api/opml/import/route";

function makeFormRequest(file?: File) {
  const formData = new FormData();
  if (file) {
    formData.append("opmlFile", file);
  }
  return new NextRequest("http://localhost:3000/api/opml/import", {
    method: "POST",
    body: formData,
  });
}

function makeOpmlFile(content: string, name = "podcasts.opml", size?: number): File {
  if (size) {
    const oversizedContent = content.padEnd(size, " ");
    return new File([oversizedContent], name, { type: "text/xml" });
  }
  return new File([content], name, { type: "text/xml" });
}

describe("POST /api/opml/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish defaults after clearAllMocks
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockTrigger.mockResolvedValue({ id: "run_opml123" });
    mockCreatePublicToken.mockResolvedValue("test-opml-token");
    mockCurrentUser.mockResolvedValue({
      primaryEmailAddressId: "email_1",
      emailAddresses: [{ id: "email_1", emailAddress: "user@example.com" }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const response = await POST(makeFormRequest(makeOpmlFile("<opml/>")));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when no file is provided", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" });

    const response = await POST(makeFormRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("An OPML file is required");
  });

  it("returns 400 when file exceeds 1MB", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" });

    const largeFile = makeOpmlFile("<opml/>", "large.opml", 1.5 * 1024 * 1024);
    const response = await POST(makeFormRequest(largeFile));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("too large");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 300000 });

    const response = await POST(makeFormRequest(makeOpmlFile("<opml/>")));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain("Rate limit exceeded");
  });

  it("returns 400 when OPML parsing fails", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockParseOpml.mockImplementation(() => {
      throw new Error("Invalid OPML: missing <opml> root element");
    });

    const response = await POST(makeFormRequest(makeOpmlFile("not valid opml")));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("missing <opml> root element");
  });

  it("returns immediate response when all feeds are already subscribed", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockParseOpml.mockReturnValue([
      { feedUrl: "https://a.com/feed", title: "A" },
      { feedUrl: "https://b.com/feed", title: "B" },
    ]);
    mockWhere.mockResolvedValue([
      { rssFeedUrl: "https://a.com/feed" },
      { rssFeedUrl: "https://b.com/feed" },
    ]);

    const response = await POST(makeFormRequest(makeOpmlFile("<opml/>")));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.total).toBe(2);
    expect(data.alreadySubscribed).toBe(2);
    expect(data.runId).toBeUndefined();
  });

  it("returns 202 with run handle when triggering import", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockParseOpml.mockReturnValue([
      { feedUrl: "https://a.com/feed", title: "A" },
      { feedUrl: "https://b.com/feed", title: "B" },
      { feedUrl: "https://c.com/feed", title: "C" },
    ]);
    mockWhere.mockResolvedValue([
      { rssFeedUrl: "https://b.com/feed" },
    ]);

    const response = await POST(makeFormRequest(makeOpmlFile("<opml/>")));
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.runId).toBe("run_opml123");
    expect(data.publicAccessToken).toBe("test-opml-token");
    expect(data.total).toBe(3);
    expect(data.alreadySubscribed).toBe(1);

    expect(mockTrigger).toHaveBeenCalledWith("import-opml", {
      userId: "user-1",
      userEmail: "user@example.com",
      feeds: [
        { feedUrl: "https://a.com/feed", title: "A" },
        { feedUrl: "https://c.com/feed", title: "C" },
      ],
      alreadySubscribedCount: 1,
    });
  });

  it("triggers import with all feeds when none are subscribed", async () => {
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockParseOpml.mockReturnValue([
      { feedUrl: "https://new.com/feed", title: "New" },
    ]);
    mockWhere.mockResolvedValue([]);

    const response = await POST(makeFormRequest(makeOpmlFile("<opml/>")));
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data.total).toBe(1);
    expect(data.alreadySubscribed).toBe(0);
  });
});
