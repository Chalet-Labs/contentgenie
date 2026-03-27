"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Zap, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getEpisodeStatus } from "@/app/actions/admin"

interface EpisodeTranscriptFetchButtonProps {
  episodeDbId: number
  podcastIndexId: string
  transcriptStatus: string | null
  onTranscriptReady: () => void
}

const POLL_INTERVAL_MS = 5000
const POLL_CAP = 240

export function EpisodeTranscriptFetchButton({
  episodeDbId,
  podcastIndexId,
  transcriptStatus: initialTranscriptStatus,
  onTranscriptReady,
}: EpisodeTranscriptFetchButtonProps) {
  const [isFetching, setIsFetching] = useState(false)
  const [transcriptStatus, setTranscriptStatus] = useState(initialTranscriptStatus)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCount = useRef(0)
  const onTranscriptReadyRef = useRef(onTranscriptReady)
  onTranscriptReadyRef.current = onTranscriptReady

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Returns null when transcript is available (nothing to fetch) or null (never
  // processed — handled by the existing "Generate Summary" button in the page)
  if (transcriptStatus === "available" || transcriptStatus === null) {
    return null
  }

  const isRss = podcastIndexId.startsWith("rss-")
  const label = isFetching ? "Fetching transcript..." : "Fetch & Summarize"

  const startPolling = () => {
    pollCount.current = 0
    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      pollCount.current += 1

      if (pollCount.current >= POLL_CAP) {
        clearInterval(pollRef.current!)
        setIsFetching(false)
        toast.error("Transcript fetch timed out — retry or check back later")
        return
      }

      const result = await getEpisodeStatus(episodeDbId)

      if (!result.ok) {
        clearInterval(pollRef.current!)
        setIsFetching(false)
        toast.error(result.error)
        return
      }

      if (result.transcriptStatus === "available") {
        clearInterval(pollRef.current!)
        setIsFetching(false)
        setTranscriptStatus("available")
        onTranscriptReadyRef.current()
      } else if (result.transcriptStatus === "failed") {
        clearInterval(pollRef.current!)
        setIsFetching(false)
        setTranscriptStatus("failed")
        toast.error("Transcript fetch failed — please try again")
      }
    }, POLL_INTERVAL_MS)
  }

  const handleClick = async () => {
    setIsFetching(true)

    try {
      const res = await fetch("/api/episodes/fetch-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: episodeDbId }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error ?? `Request failed (HTTP ${res.status})`)
      }

      startPolling()
    } catch (err) {
      setIsFetching(false)
      toast.error(err instanceof Error ? err.message : "Failed to start transcript fetch")
    }
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">
            <Button
              variant="outline"
              size="sm"
              aria-label={label}
              disabled={isRss || isFetching}
              onClick={handleClick}
            >
              {isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        {isRss && (
          <TooltipContent>
            RSS episodes cannot be fetched via PodcastIndex
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
