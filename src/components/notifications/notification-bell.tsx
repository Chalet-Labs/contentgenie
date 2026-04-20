"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUnreadCount } from "@/app/actions/notifications";

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await getUnreadCount();
      setUnreadCount(count);
    } catch {
      // Silently fail — badge will show stale count
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  return (
    <Button variant="ghost" size="icon" className="relative" asChild>
      <Link href="/notifications">
        <Bell className="h-[1.2rem] w-[1.2rem]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        <span className="sr-only">Notifications</span>
      </Link>
    </Button>
  );
}
