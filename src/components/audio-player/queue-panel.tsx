"use client";

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
import { useMediaQuery } from "@/hooks/use-media-query";
import { QueueList } from "@/components/audio-player/queue-list";

interface QueuePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactElement;
}

export function QueuePanel({ open, onOpenChange, trigger }: QueuePanelProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={12}
          className="w-80 p-3"
        >
          <QueueList maxHeight="50vh" />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="h-[100dvh]">
        <SheetHeader>
          <SheetTitle>Queue</SheetTitle>
          <SheetDescription className="sr-only">
            Manage your episode queue
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <QueueList maxHeight="50vh" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
