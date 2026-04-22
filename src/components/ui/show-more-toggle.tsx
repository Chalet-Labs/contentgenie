"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShowMoreToggleProps {
  expanded: boolean;
  hiddenCount: number;
  onToggle: () => void;
  className?: string;
}

export function ShowMoreToggle({ expanded, hiddenCount, onToggle, className }: ShowMoreToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn("mt-2 w-full", className)}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      {expanded ? (
        <>
          Show less
          <ChevronUp className="ml-2 h-4 w-4" />
        </>
      ) : (
        <>
          Show {hiddenCount} more
          <ChevronDown className="ml-2 h-4 w-4" />
        </>
      )}
    </Button>
  );
}
