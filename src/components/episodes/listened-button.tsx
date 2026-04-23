"use client"

import { useState, useTransition } from "react"
import { Check, CheckCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { recordListenEvent } from "@/app/actions/listen-history"
import { LISTEN_STATE_CHANGED_EVENT } from "@/lib/events"

interface ListenedButtonProps {
  podcastIndexEpisodeId: string
  isListened: boolean
}

export function ListenedButton({ podcastIndexEpisodeId, isListened }: ListenedButtonProps) {
  const [listened, setListened] = useState(isListened)
  const [isPending, startTransition] = useTransition()

  if (listened) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span aria-label="Already listened" className="flex h-8 w-8 shrink-0 items-center justify-center">
              <CheckCheck className="h-4 w-4 text-primary" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Already listened</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const handleClick = () => {
    setListened(true)
    startTransition(async () => {
      const result = await recordListenEvent({ podcastIndexEpisodeId, completed: true })
      if (!result.success) {
        setListened(false)
        toast.error(result.error || "Failed to mark as listened")
        return
      }
      toast.success("Marked as listened")
      window.dispatchEvent(new CustomEvent(LISTEN_STATE_CHANGED_EVENT))
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={isPending}
      aria-label="Mark as listened"
      className="h-8 w-8 shrink-0"
    >
      <Check className="h-4 w-4" />
    </Button>
  )
}
