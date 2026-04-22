"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getUnreadCount,
  getNotificationSummary,
} from "@/app/actions/notifications";
import type { NotificationSummary } from "@/app/actions/notifications";
import { NotificationPopover } from "@/components/notifications/notification-popover";
import { formatRelativeTime } from "@/lib/utils";

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const c = await getUnreadCount();
      setUnreadCount(c);
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

  // Close on route change (skip initial mount — popover starts closed)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setOpen(false);
  }, [pathname]);

  const fetchSummary = useCallback(async () => {
    setSummary(null);
    setSummaryError(false);
    try {
      const result = await getNotificationSummary();
      setSummary(result);
    } catch {
      setSummaryError(true);
    }
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        fetchSummary();
      } else {
        // Reset so next open re-fetches fresh data
        setSummary(null);
        setSummaryError(false);
      }
    },
    [fetchSummary]
  );

  const tooltip = lastUpdatedAt
    ? `Notifications · Updated ${formatRelativeTime(lastUpdatedAt)}`
    : "Notifications";

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      title={tooltip}
      aria-label="Notifications"
    >
      <Bell className="h-[1.2rem] w-[1.2rem]" />
      {unreadCount !== null && unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
      <span className="sr-only">Notifications</span>
    </Button>
  );

  return (
    <NotificationPopover
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      summary={summary}
      isError={summaryError}
      onRetry={fetchSummary}
    />
  );
}
