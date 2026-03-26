"use client"

import { useState, useEffect, useRef } from "react"
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

interface EpisodeActionButtonsProps {
  episode: {
    id: number
    transcriptStatus: string | null
    summaryStatus: string | null
    podcastIndexId: string
  }
}

const POLL_INTERVAL_MS = 5000
const TRANSCRIPT_POLL_CAP = 240
const SUMMARY_POLL_CAP = 120

export function EpisodeActionButtons({ episode }: EpisodeActionButtonsProps) {
  const [localTranscriptStatus, setLocalTranscriptStatus] = useState(
    episode.transcriptStatus
  )
  const [localSummaryStatus, setLocalSummaryStatus] = useState(
    episode.summaryStatus
  )
  const [transcriptMsg, setTranscriptMsg] = useState<string | null>(null)
  const [summaryMsg, setSummaryMsg] = useState<string | null>(null)

  const transcriptPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const summaryPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptPollCount = useRef(0)
  const summaryPollCount = useRef(0)
  const [isCombinedAction, _setIsCombinedAction] = useState(false)
  const isCombinedRef = useRef(false)
  const setCombinedAction = (value: boolean) => {
    isCombinedRef.current = value
    _setIsCombinedAction(value)
  }
  const handleSummarizeRef = useRef<() => Promise<void>>(() => Promise.resolve())

  useEffect(() => {
    return () => {
      if (transcriptPollRef.current) clearInterval(transcriptPollRef.current)
      if (summaryPollRef.current) clearInterval(summaryPollRef.current)
    }
  }, [])

  const startTranscriptPolling = () => {
    transcriptPollCount.current = 0
    if (transcriptPollRef.current) clearInterval(transcriptPollRef.current)

    transcriptPollRef.current = setInterval(async () => {
      try {
        transcriptPollCount.current += 1

        if (transcriptPollCount.current >= TRANSCRIPT_POLL_CAP) {
          clearInterval(transcriptPollRef.current!)
          setCombinedAction(false)
          setLocalTranscriptStatus(episode.transcriptStatus)
          setTranscriptMsg("Still fetching — check back later")
          return
        }

        const result = await getEpisodeStatus(episode.id)
        if (!result.ok) {
          clearInterval(transcriptPollRef.current!)
          setCombinedAction(false)
          setLocalTranscriptStatus(episode.transcriptStatus)
          setTranscriptMsg(result.error)
          return
        }

        setLocalTranscriptStatus(prev =>
          prev !== result.transcriptStatus ? result.transcriptStatus : prev
        )

        if (result.transcriptStatus === "available") {
          clearInterval(transcriptPollRef.current!)
          setTranscriptMsg(null)
          if (isCombinedRef.current) {
            setCombinedAction(false)
            handleSummarizeRef.current()
          }
        } else if (result.transcriptStatus === "failed") {
          clearInterval(transcriptPollRef.current!)
          setCombinedAction(false)
          setTranscriptMsg("Transcript fetch failed")
        }
      } catch (err) {
        clearInterval(transcriptPollRef.current!)
        setCombinedAction(false)
        setLocalTranscriptStatus(episode.transcriptStatus)
        console.error(`Transcript status poll failed for episode ${episode.id}:`, err)
        setTranscriptMsg("Status check failed — try refreshing")
      }
    }, POLL_INTERVAL_MS)
  }

  const startSummaryPolling = () => {
    summaryPollCount.current = 0
    if (summaryPollRef.current) clearInterval(summaryPollRef.current)

    summaryPollRef.current = setInterval(async () => {
      try {
        summaryPollCount.current += 1

        if (summaryPollCount.current >= SUMMARY_POLL_CAP) {
          clearInterval(summaryPollRef.current!)
          setSummaryMsg("Still processing — check back later")
          return
        }

        const result = await getEpisodeStatus(episode.id)
        if (!result.ok) {
          clearInterval(summaryPollRef.current!)
          setSummaryMsg(result.error)
          return
        }

        setLocalSummaryStatus(prev =>
          prev !== result.summaryStatus ? result.summaryStatus : prev
        )

        if (
          result.summaryStatus === "completed" ||
          result.summaryStatus === "failed"
        ) {
          clearInterval(summaryPollRef.current!)
          setSummaryMsg(null)
        }
      } catch (err) {
        clearInterval(summaryPollRef.current!)
        console.error(`Summary status poll failed for episode ${episode.id}:`, err)
        setSummaryMsg("Status check failed — try refreshing")
      }
    }, POLL_INTERVAL_MS)
  }

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
        throw new Error(await res.text().catch(() => `Request failed (HTTP ${res.status})`))
      }

      startTranscriptPolling()
    } catch (err) {
      setCombinedAction(false)
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
        throw new Error(await res.text().catch(() => `Request failed (HTTP ${res.status})`))
      }

      startSummaryPolling()
    } catch (err) {
      setLocalSummaryStatus(previousStatus)
      setSummaryMsg(err instanceof Error ? err.message : "Failed to start summarization")
    }
  }
  handleSummarizeRef.current = handleSummarize

  const handleFetchAndSummarize = () => {
    setCombinedAction(true)
    handleFetchTranscript()
  }

  const transcriptInProgress = localTranscriptStatus === "fetching"
  const summaryInProgress = IN_PROGRESS_STATUSES.includes(
    localSummaryStatus as SummaryStatus
  )
  const transcriptAvailable = localTranscriptStatus === "available"
  const showFetchAndSummarize =
    localTranscriptStatus === "missing" || localTranscriptStatus === "failed"

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
          </TooltipTrigger>
          <TooltipContent>{fetchTranscriptLabel}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent>{summarizeLabel}</TooltipContent>
        </Tooltip>

        {showFetchAndSummarize && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                aria-label={fetchAndSummarizeLabel}
                disabled={transcriptInProgress || summaryInProgress}
                onClick={handleFetchAndSummarize}
              >
                {transcriptInProgress || summaryInProgress ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{fetchAndSummarizeLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}
