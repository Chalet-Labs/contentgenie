import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";

const ALLOWED_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);

function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_PUSH_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint, keys, userAgent } = body;

    if (
      !endpoint ||
      typeof endpoint !== "string" ||
      !isAllowedPushEndpoint(endpoint) ||
      !keys?.p256dh ||
      typeof keys.p256dh !== "string" ||
      !keys?.auth ||
      typeof keys.auth !== "string"
    ) {
      return NextResponse.json(
        { error: "Invalid push subscription data" },
        { status: 400 }
      );
    }

    await db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: typeof userAgent === "string" ? userAgent : null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: typeof userAgent === "string" ? userAgent : null,
          createdAt: new Date(),
        },
      });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Error saving push subscription:", error);
    return NextResponse.json(
      { error: "Failed to save push subscription" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint || typeof endpoint !== "string") {
      return NextResponse.json(
        { error: "Endpoint is required" },
        { status: 400 }
      );
    }

    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint)
        )
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing push subscription:", error);
    return NextResponse.json(
      { error: "Failed to remove push subscription" },
      { status: 500 }
    );
  }
}
