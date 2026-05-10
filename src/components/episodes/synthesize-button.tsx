"use client";

import { useTransition } from "react";
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
  const [isPending, startTransition] = useTransition();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      try {
        await triggerTopicDigestGeneration({ canonicalTopicId });
      } catch (err) {
        console.error("[SynthesizeButton] action failed", err);
      }
      router.push(`/topic/${canonicalTopicId}`);
    });
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
