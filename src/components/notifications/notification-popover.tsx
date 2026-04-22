"use client";

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
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { NotificationSummaryList } from "@/components/notifications/notification-summary-list";
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
}: {
  summary: NotificationSummary | null;
  isError: boolean;
  onRetry: () => void;
}) {
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
          <NotificationSummaryList summary={summary} />
        )}
      </div>
      <Link
        href="/notifications"
        className="block border-t p-3 text-center text-sm hover:underline"
      >
        See all
      </Link>
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
          <PopoverBody summary={summary} isError={isError} onRetry={onRetry} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <div onClick={() => onOpenChange(!open)}>{trigger}</div>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription className="sr-only">
            Grouped notification summary
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col flex-1 overflow-hidden">
          <PopoverBody summary={summary} isError={isError} onRetry={onRetry} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
