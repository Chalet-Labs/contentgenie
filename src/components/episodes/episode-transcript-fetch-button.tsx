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
import type { TranscriptStatus } from "@/db/schema"

interface EpisodeTranscriptFetchButtonProps {
  episodeDbId: number | null
  podcastIndexId: string
  transcriptStatus: TranscriptStatus | null
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
  const [isFetching, setIsFetching] = useState(initialTranscriptStatus === "fetching")
  const [transcriptStatus, setTranscriptStatus] = useState(
    initialTranscriptStatus === "fetching" ? "missing" : initialTranscriptStatus
  )
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCount = useRef(0)
  const onTranscriptReadyRef = useRef(onTranscriptReady)
  onTranscriptReadyRef.current = onTranscriptReady
  // Authoritative DB primary key for polling and subsequent requests. Starts as episodeDbId
  // (may be null for episodes not yet in DB). Updated from the API response after on-demand row creation.
  const resolvedDbIdRef = useRef<number | null>(episodeDbId)

  function startPolling(dbId: number) {
    pollCount.current = 0
    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      try {
        pollCount.current += 1

        const result = await getEpisodeStatus(dbId)

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
        } else if (pollCount.current >= POLL_CAP) {
          clearInterval(pollRef.current!)
          setIsFetching(false)
          toast.error("Transcript fetch timed out — retry or check back later")
        }
      } catch (err) {
        console.error("Polling status check failed:", err)
        clearInterval(pollRef.current!)
        setIsFetching(false)
        toast.error("Status check failed — try refreshing")
      }
    }, POLL_INTERVAL_MS)
  }

  useEffect(() => {
    // Only start polling on mount if we have a DB ID to poll against.
    // When episodeDbId is null, a transcript fetch was started but the episode has no
    // DB row yet. getEpisodeStatus requires a numeric id — passing null would fail.
    if (initialTranscriptStatus === "fetching" && episodeDbId !== null) {
      startPolling(episodeDbId)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Hide button when transcript is already available — all other statuses
  // (null, missing, failed, fetching) render the fetch UI for admins.
  if (transcriptStatus === "available") {
    return null
  }

  const isRss = podcastIndexId.startsWith("rss-")
  const label = isFetching ? "Fetching transcript..." : "Fetch & Summarize"

  const handleClick = async () => {
    setIsFetching(true)

    try {
      // Use DB primary key when available (faster lookup); fall back to podcastIndexId for on-demand creation
      const body = resolvedDbIdRef.current !== null
        ? { episodeId: resolvedDbIdRef.current }
        : { podcastIndexId }

      const res = await fetch("/api/episodes/fetch-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error ?? `Request failed (HTTP ${res.status})`)
      }

      let responseData;
      try {
        responseData = await res.json();
      } catch (parseErr) {
        console.error("Failed to parse fetch-transcript response:", parseErr)
        // Run was queued server-side but we can't read the response — fall through
        // to the no-DB-ID handling below which will show an appropriate message.
        responseData = null;
      }

      // Capture episodeDbId from response so we can poll even when we started without one
      const returnedDbId: number | null =
        typeof responseData?.episodeDbId === "number" ? responseData.episodeDbId : null

      if (returnedDbId !== null) {
        resolvedDbIdRef.current = returnedDbId
        startPolling(returnedDbId)
      } else if (resolvedDbIdRef.current !== null) {
        startPolling(resolvedDbIdRef.current)
      } else {
        // No DB ID available — can't poll, but run was queued
        setIsFetching(false)
        toast.error("Transcript fetch started but status polling is unavailable — refresh the page to check progress")
      }
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
        <TooltipContent>
          {isRss
            ? "RSS episodes cannot be fetched via PodcastIndex"
            : isFetching
              ? "Fetching transcript and summary — this may take a few minutes"
              : "Fetch a transcript and generate a summary"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
