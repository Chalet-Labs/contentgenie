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

  // Mirror of unreadCount for use inside stable callbacks — reading the ref
  // avoids a 60s churn of `handleOpenChange` identity on every poll tick.
  const unreadCountRef = useRef<number | null>(null);
  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

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

  // Parallel race guard for mark-all: also bumped on close so a fetch that
  // resolves after the user closed the popover short-circuits before mark.
  const markAllIdRef = useRef(0);

  // Fetch-then-mark: unread SELECT must observe the rows before the UPDATE
  // commits, and marking on open advances the "since last visit" boundary
  // for the next open. Also the Retry path — after a transient fetch
  // failure the user still sees the list, so mark-read must still run.
  const openAndMarkRead = useCallback(async () => {
    const fetchOk = await fetchSummary();
    if (!fetchOk) return;

    const markId = ++markAllIdRef.current;
    const prev = unreadCountRef.current;
    setUnreadCount(0);
    // Revert only if our optimistic 0 is still on screen. A 60s poll tick (or
    // any other writer) that landed a fresher count between setUnreadCount(0)
    // and this failure branch must not be clobbered by the stale `prev`.
    const revertIfStillZero = () => {
      setUnreadCount((c) => (c === 0 ? prev : c));
    };
    try {
      const result = await markAllNotificationsRead();
      if (markId !== markAllIdRef.current) return;
      if (!result.success) {
        console.error("markAllNotificationsRead failed:", result.error);
        revertIfStillZero();
      }
    } catch (error) {
      if (markId !== markAllIdRef.current) return;
      console.error("Failed to mark all notifications as read:", error);
      revertIfStillZero();
    }
  }, [fetchSummary]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) {
        // Close invalidates any in-flight flow: a summary that resolves
        // after close must not advance the read boundary over rows the
        // user never saw, and a late mark-all rejection must not revert
        // a badge already overwritten by a later cycle.
        fetchIdRef.current++;
        markAllIdRef.current++;
        return;
      }
      void openAndMarkRead();
    },
    [openAndMarkRead]
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
      onRetry={openAndMarkRead}
    />
  );
}
