"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { triggerTopicDigestGeneration } from "@/app/actions/topics";

export interface SynthesizeButtonProps {
  canonicalTopicId: number;
  label: string;
}

export function SynthesizeButton({
  canonicalTopicId,
  label,
}: SynthesizeButtonProps) {
  const router = useRouter();
  // Explicit useState (NOT useTransition): React 18's `useTransition` does
  // not track async work passed to `startTransition` — `isPending` flips off
  // as soon as the synchronous portion of the callback returns, leaving a
  // window where the user can double-click and fire two action invocations.
  // A manual loading flag covers the entire awaited lifecycle.
  const [isPending, setIsPending] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPending) return;
    setIsPending(true);
    try {
      await triggerTopicDigestGeneration({ canonicalTopicId });
    } catch (err) {
      console.error("[SynthesizeButton] action failed", {
        canonicalTopicId,
        err,
      });
    } finally {
      router.push(`/topic/${canonicalTopicId}`);
      // Don't clear isPending — the navigation unmounts this component.
      // Clearing here would briefly re-enable the button mid-route-change.
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            aria-label={`Synthesize digest for ${label}`}
            disabled={isPending}
            onClick={handleClick}
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3 w-3" aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Synthesize digest</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
