"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUnreadCount } from "@/app/actions/notifications";
import { formatRelativeTime } from "@/lib/utils";

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await getUnreadCount();
      setUnreadCount(count);
      setLastUpdatedAt(new Date());
    } catch (error) {
      // Swallow so the badge keeps the last known count instead of flipping to 0.
      console.error("Failed to fetch unread notification count:", error);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const tooltip = lastUpdatedAt
    ? `Notifications \u00b7 Updated ${formatRelativeTime(lastUpdatedAt)}`
    : "Notifications";

  return (
    <Button variant="ghost" size="icon" className="relative" asChild>
      <Link href="/notifications" title={tooltip}>
        <Bell className="h-[1.2rem] w-[1.2rem]" />
        {unreadCount !== null && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        <span className="sr-only">Notifications</span>
      </Link>
    </Button>
  );
}
