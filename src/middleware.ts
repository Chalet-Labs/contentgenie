import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/offline",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

const PUBLIC_EPISODE_PAGE_RE = /^\/episode\/(?:\d+|rss-[^/]+)$/;
const PUBLIC_EPISODE_API_RE = /^\/api\/episodes\/(?:\d+|rss-[^/]+)$/;

function isPublicEpisodePageRequest(req: NextRequest): boolean {
  return PUBLIC_EPISODE_PAGE_RE.test(req.nextUrl.pathname);
}

function isPublicEpisodeApiRequest(req: NextRequest): boolean {
  if (req.method !== "GET") return false;
  return PUBLIC_EPISODE_API_RE.test(req.nextUrl.pathname);
}

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  // Redirect authenticated users from landing page to dashboard
  if (userId && req.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (
    !isPublicRoute(req) &&
    !isPublicEpisodePageRequest(req) &&
    !isPublicEpisodeApiRequest(req)
  ) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
