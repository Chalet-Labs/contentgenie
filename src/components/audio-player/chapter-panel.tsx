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
import { ChapterList } from "@/components/audio-player/chapter-list";

interface ChapterPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactElement;
}

export function ChapterPanel({
  open,
  onOpenChange,
  trigger,
}: ChapterPanelProps) {
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
          <ChapterList />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="h-[100dvh]">
        <SheetHeader>
          <SheetTitle>Chapters</SheetTitle>
          <SheetDescription className="sr-only">
            Navigate episode chapters
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <ChapterList />
        </div>
      </SheetContent>
    </Sheet>
  );
}
