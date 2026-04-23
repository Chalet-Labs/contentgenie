"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  NotificationSummaryList,
  groupKeyOf,
} from "@/components/notifications/notification-summary-list";
import type { NotificationSummary } from "@/app/actions/notifications";

interface NotificationPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactElement;
  summary: NotificationSummary | null;
  isError: boolean;
  onRetry: () => void;
  forceSurface?: "popover" | "sheet";
}

function PopoverBody({
  summary,
  isError,
  onRetry,
  onItemClick,
  onClearAll,
}: {
  summary: NotificationSummary | null;
  isError: boolean;
  onRetry: () => void;
  onItemClick: (groupKey: string) => void;
  onClearAll: () => void;
}) {
  const hasItems = summary !== null && summary.groups.length > 0;
  return (
    <>
      <div className="max-h-96 overflow-y-auto">
        {isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-sm">Couldn&apos;t load notifications</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
        ) : summary === null ? (
          <div className="space-y-2 p-4">
            <div data-testid="skeleton-row">
              <Skeleton className="h-5 w-full" />
            </div>
            <div data-testid="skeleton-row">
              <Skeleton className="h-5 w-full" />
            </div>
            <div data-testid="skeleton-row">
              <Skeleton className="h-5 w-full" />
            </div>
          </div>
        ) : (
          <NotificationSummaryList
            summary={summary}
            onItemClick={onItemClick}
          />
        )}
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2">
        <Link
          href="/notifications"
          className="px-1 py-1 text-sm hover:underline"
        >
          See all
        </Link>
        {hasItems && (
          <Button variant="ghost" size="sm" onClick={onClearAll}>
            Clear all
          </Button>
        )}
      </div>
    </>
  );
}

export function NotificationPopover({
  open,
  onOpenChange,
  trigger,
  summary,
  isError,
  onRetry,
  forceSurface,
}: NotificationPopoverProps) {
  const isDesktopQuery = useMediaQuery("(min-width: 768px)");
  const isDesktop =
    forceSurface === "popover"
      ? true
      : forceSurface === "sheet"
        ? false
        : isDesktopQuery;

  // `displayedSummary` is the popover's view of the summary — it diverges from
  // the `summary` prop when the user clicks items or "Clear all", so items can
  // visually disappear without waiting for a server refetch. It resyncs
  // whenever the parent provides a new summary (e.g., a fresh fetch on open).
  const [displayedSummary, setDisplayedSummary] = useState<
    NotificationSummary | null
  >(summary);

  useEffect(() => {
    setDisplayedSummary(summary);
  }, [summary]);

  const handleItemClick = useCallback((groupKey: string) => {
    setDisplayedSummary((s) => {
      if (!s) return s;
      // Decrement totalUnread by the removed group's count so the summary stays
      // internally consistent — otherwise `groups=[]` with `totalUnread>0` drops
      // the list into NotificationSummaryList's legacy "N unread notifications"
      // fallback on the next render.
      const removed = s.groups.find((g) => groupKeyOf(g) === groupKey);
      const removedCount = removed?.count ?? 0;
      return {
        ...s,
        totalUnread: Math.max(0, s.totalUnread - removedCount),
        groups: s.groups.filter((g) => groupKeyOf(g) !== groupKey),
      };
    });
  }, []);

  const handleClearAll = useCallback(() => {
    setDisplayedSummary({ totalUnread: 0, groups: [] });
  }, []);

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-80 p-0"
          aria-label="Notifications"
        >
          <div className="flex items-center border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
          </div>
          <PopoverBody
            summary={displayedSummary}
            isError={isError}
            onRetry={onRetry}
            onItemClick={handleItemClick}
            onClearAll={handleClearAll}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription className="sr-only">
            Grouped notification summary
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col flex-1 overflow-hidden">
          <PopoverBody
            summary={displayedSummary}
            isError={isError}
            onRetry={onRetry}
            onItemClick={handleItemClick}
            onClearAll={handleClearAll}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
