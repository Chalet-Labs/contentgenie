import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextFetchEvent } from "next/server";
import { NextRequest, NextResponse } from "next/server";

type MiddlewareCallback = (auth: unknown, req: NextRequest) => Promise<unknown>;

function createClerkMock(userId: string | null, mockProtect?: ReturnType<typeof vi.fn>) {
  return {
    clerkMiddleware: (cb: MiddlewareCallback) => {
      return async (req: NextRequest) => {
        const protect = mockProtect ?? vi.fn();
        const authFn = Object.assign(vi.fn().mockResolvedValue({ userId }), { protect });
        return cb(authFn, req);
      };
    },
    createRouteMatcher: (patterns: string[]) => {
      return (req: NextRequest) => {
        return patterns.some((pattern) => {
          const regex = new RegExp(`^${pattern.replace("(.*)", ".*")}$`);
          return regex.test(req.nextUrl.pathname);
        });
      };
    },
  };
}

// Our mock doesn't use the event, so a stub satisfies the type
const stubEvent = {} as NextFetchEvent;

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("redirects authenticated users from / to /dashboard", async () => {
    vi.doMock("@clerk/nextjs/server", () => createClerkMock("user_123"));

    const { default: middleware } = await import("@/middleware");
    const req = new NextRequest("http://localhost:3000/");
    const response = await middleware(req, stubEvent);

    expect(response).toBeInstanceOf(NextResponse);
    expect((response as NextResponse).headers.get("location")).toBe(
      "http://localhost:3000/dashboard"
    );
  });

  it("does not redirect unauthenticated users from /", async () => {
    vi.doMock("@clerk/nextjs/server", () => createClerkMock(null));

    const { default: middleware } = await import("@/middleware");
    const req = new NextRequest("http://localhost:3000/");
    const response = await middleware(req, stubEvent);

    if (response instanceof NextResponse) {
      expect(response.headers.get("location")).not.toBe(
        "http://localhost:3000/dashboard"
      );
    }
  });

  it("does not redirect authenticated users from other routes", async () => {
    vi.doMock("@clerk/nextjs/server", () => createClerkMock("user_123"));

    const { default: middleware } = await import("@/middleware");
    const req = new NextRequest("http://localhost:3000/dashboard");
    const response = await middleware(req, stubEvent);

    if (response instanceof NextResponse) {
      expect(response.headers.get("location")).not.toBe(
        "http://localhost:3000/dashboard"
      );
    }
  });

  it("calls auth.protect() for protected routes", async () => {
    const mockProtect = vi.fn();
    vi.doMock("@clerk/nextjs/server", () => createClerkMock(null, mockProtect));

    const { default: middleware } = await import("@/middleware");
    const req = new NextRequest("http://localhost:3000/dashboard");
    await middleware(req, stubEvent);

    expect(mockProtect).toHaveBeenCalled();
  });
});
