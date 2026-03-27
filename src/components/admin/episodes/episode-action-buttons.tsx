"use client"

import { useState, useEffect, useRef } from "react"
import { useRealtimeRun } from "@trigger.dev/react-hooks"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { FileText, Sparkles, Zap, Loader2 } from "lucide-react"
import { getEpisodeStatus } from "@/app/actions/admin"
import { IN_PROGRESS_STATUSES, type SummaryStatus } from "@/db/schema"
import type { fetchTranscriptTask } from "@/trigger/fetch-transcript"
import type { summarizeEpisode } from "@/trigger/summarize-episode"

interface EpisodeActionButtonsProps {
  episode: {
    id: number
    transcriptStatus: string | null
    summaryStatus: string | null
    podcastIndexId: string
  }
}

const TERMINAL_STATUSES = [
  "COMPLETED",
  "FAILED",
  "CANCELED",
  "TIMED_OUT",
  "SYSTEM_FAILURE",
  "CRASHED",
  "EXPIRED",
] as const

export function EpisodeActionButtons({ episode }: EpisodeActionButtonsProps) {
  const [localTranscriptStatus, setLocalTranscriptStatus] = useState(
    episode.transcriptStatus
  )
  const [localSummaryStatus, setLocalSummaryStatus] = useState(
    episode.summaryStatus
  )
  const [transcriptMsg, setTranscriptMsg] = useState<string | null>(null)
  const [summaryMsg, setSummaryMsg] = useState<string | null>(null)

  const [transcriptRunId, setTranscriptRunId] = useState<string | null>(null)
  const [transcriptAccessToken, setTranscriptAccessToken] = useState<string | null>(null)
  const [summaryRunId, setSummaryRunId] = useState<string | null>(null)
  const [summaryAccessToken, setSummaryAccessToken] = useState<string | null>(null)

  const isCombinedRef = useRef(false)
  const handleSummarizeRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const { run: transcriptRun } = useRealtimeRun<typeof fetchTranscriptTask>(
    transcriptRunId ?? "",
    {
      accessToken: transcriptAccessToken ?? "",
      enabled: !!transcriptRunId && !!transcriptAccessToken,
    }
  )

  const { run: summaryRun } = useRealtimeRun<typeof summarizeEpisode>(
    summaryRunId ?? "",
    {
      accessToken: summaryAccessToken ?? "",
      enabled: !!summaryRunId && !!summaryAccessToken,
    }
  )

  useEffect(() => {
    if (!transcriptRun) return
    if (!TERMINAL_STATUSES.includes(transcriptRun.status as (typeof TERMINAL_STATUSES)[number])) return

    if (transcriptRun.status === "COMPLETED") {
      setLocalTranscriptStatus("available")
      setTranscriptMsg(null)
      setTranscriptRunId(null)
      setTranscriptAccessToken(null)
      if (isCombinedRef.current) {
        isCombinedRef.current = false
        handleSummarizeRef.current()
      }
    } else {
      setLocalTranscriptStatus("failed")
      setTranscriptMsg("Transcript fetch failed")
      setTranscriptRunId(null)
      setTranscriptAccessToken(null)
      isCombinedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptRun?.status])

  useEffect(() => {
    if (!summaryRun) return
    if (!TERMINAL_STATUSES.includes(summaryRun.status as (typeof TERMINAL_STATUSES)[number])) return

    if (summaryRun.status === "COMPLETED") {
      setLocalSummaryStatus("completed")
      setSummaryMsg(null)
    } else {
      setLocalSummaryStatus("failed")
      setSummaryMsg("Summarization failed")
    }
    setSummaryRunId(null)
    setSummaryAccessToken(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryRun?.status])

  // Recovery: page may have loaded mid-run with no active socket to reconnect to
  useEffect(() => {
    const transcriptInFlight = episode.transcriptStatus === "fetching"
    const summaryInFlight =
      episode.summaryStatus !== null &&
      IN_PROGRESS_STATUSES.includes(episode.summaryStatus as SummaryStatus)

    if (!transcriptInFlight && !summaryInFlight) return

    let cancelled = false
    getEpisodeStatus(episode.id)
      .then(result => {
        if (cancelled) return
        if (!result.ok) return
        if (transcriptInFlight && result.transcriptStatus !== "fetching") {
          setLocalTranscriptStatus(result.transcriptStatus)
        }
        if (
          summaryInFlight &&
          result.summaryStatus !== null &&
          !IN_PROGRESS_STATUSES.includes(result.summaryStatus as SummaryStatus)
        ) {
          setLocalSummaryStatus(result.summaryStatus)
        }
      })
      .catch(() => {
        // Best-effort recovery — ignore errors, spinner remains until user retries
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFetchTranscript = async () => {
    const previousStatus = localTranscriptStatus
    setLocalTranscriptStatus("fetching")
    setTranscriptMsg(null)

    try {
      const res = await fetch(`/api/episodes/fetch-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: episode.id }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error ?? `Request failed (HTTP ${res.status})`)
      }

      const data = await res.json()
      if (data.runId && data.publicAccessToken) {
        setTranscriptRunId(data.runId)
        setTranscriptAccessToken(data.publicAccessToken)
      }
    } catch (err) {
      isCombinedRef.current = false
      setLocalTranscriptStatus(previousStatus)
      setTranscriptMsg(err instanceof Error ? err.message : "Failed to start transcript fetch")
    }
  }

  const handleSummarize = async () => {
    const previousStatus = localSummaryStatus
    setLocalSummaryStatus("queued")
    setSummaryMsg(null)

    try {
      const res = await fetch(`/api/episodes/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: Number(episode.podcastIndexId) }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error ?? `Request failed (HTTP ${res.status})`)
      }

      const data = await res.json()
      if (data.runId && data.publicAccessToken) {
        setSummaryRunId(data.runId)
        setSummaryAccessToken(data.publicAccessToken)
      }
    } catch (err) {
      setLocalSummaryStatus(previousStatus)
      setSummaryMsg(err instanceof Error ? err.message : "Failed to start summarization")
    }
  }
  handleSummarizeRef.current = handleSummarize

  const handleFetchAndSummarize = () => {
    if (transcriptInProgress || summaryInProgress) return
    isCombinedRef.current = true
    handleFetchTranscript()
  }

  const transcriptInProgress = localTranscriptStatus === "fetching"
  const summaryInProgress = IN_PROGRESS_STATUSES.includes(
    localSummaryStatus as SummaryStatus
  )
  const transcriptAvailable = localTranscriptStatus === "available"
  const showFetchAndSummarize =
    localTranscriptStatus === "missing" || localTranscriptStatus === "failed"
  const isCombinedAction = isCombinedRef.current

  const fetchTranscriptLabel = transcriptMsg
    ? transcriptMsg
    : transcriptInProgress
      ? "Fetching transcript..."
      : transcriptAvailable
        ? "Transcript available"
        : "Fetch Transcript"

  const summarizeBaseLabel =
    localSummaryStatus === "completed" || localSummaryStatus === "failed"
      ? "Re-summarize"
      : "Summarize"
  const summarizeLabel = summaryMsg
    ? summaryMsg
    : summaryInProgress
      ? "Summarizing..."
      : !transcriptAvailable
        ? "Transcript required"
        : summarizeBaseLabel

  const fetchAndSummarizeLabel = transcriptMsg
    ? transcriptMsg
    : transcriptInProgress
      ? "Fetching transcript..."
      : summaryInProgress
        ? "Summarizing..."
        : "Fetch & Summarize"

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                aria-label={fetchTranscriptLabel}
                disabled={
                  transcriptAvailable ||
                  transcriptInProgress ||
                  isCombinedAction
                }
                onClick={handleFetchTranscript}
              >
                {transcriptInProgress ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{fetchTranscriptLabel}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                aria-label={summarizeLabel}
                disabled={
                  !transcriptAvailable ||
                  summaryInProgress ||
                  isCombinedAction
                }
                onClick={handleSummarize}
              >
                {summaryInProgress ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{summarizeLabel}</TooltipContent>
        </Tooltip>

        {showFetchAndSummarize && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  aria-label={fetchAndSummarizeLabel}
                  disabled={
                    transcriptInProgress ||
                    summaryInProgress ||
                    isCombinedAction
                  }
                  onClick={handleFetchAndSummarize}
                >
                  {transcriptInProgress || summaryInProgress ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{fetchAndSummarizeLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}
