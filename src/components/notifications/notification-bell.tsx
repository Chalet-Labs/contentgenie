"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getUnreadCount,
  getNotificationSummary,
  markAllNotificationsRead,
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

  // Race guard: ignore stale resolutions from prior opens.
  const fetchIdRef = useRef(0);
  const fetchSummary = useCallback(async (): Promise<boolean> => {
    const fetchId = ++fetchIdRef.current;
    setSummary(null);
    setSummaryError(false);
    try {
      const result = await getNotificationSummary();
      if (fetchId !== fetchIdRef.current) return false;
      setSummary(result);
      return true;
    } catch (error) {
      console.error("Failed to fetch notification summary:", error);
      if (fetchId !== fetchIdRef.current) return false;
      setSummaryError(true);
      return false;
    }
  }, []);

  // Parallel race guard for mark-all: prevents a late rejection from
  // reverting a later open's successful mark.
  const markAllIdRef = useRef(0);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) return;

      // Order matters: fetch first so the popover renders the items that
      // were unread, then mark them read so the badge clears and the
      // `MAX(createdAt) WHERE isRead=true` used by getNotificationSummary
      // advances to "just now" for the next open (making the "since last
      // visit" group actually mean since the last open).
      void (async () => {
        const fetchOk = await fetchSummary();
        // Don't advance the "since last visit" boundary over notifications
        // the user never saw — retry via the error state re-enters this flow.
        if (!fetchOk) return;

        const markId = ++markAllIdRef.current;
        const prev = unreadCount;
        setUnreadCount(0);
        try {
          const result = await markAllNotificationsRead();
          if (markId !== markAllIdRef.current) return;
          if (!result.success) {
            console.error("markAllNotificationsRead failed:", result.error);
            setUnreadCount(prev);
          }
        } catch (error) {
          if (markId !== markAllIdRef.current) return;
          console.error("Failed to mark all notifications as read:", error);
          setUnreadCount(prev);
        }
      })();
    },
    [fetchSummary, unreadCount]
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
