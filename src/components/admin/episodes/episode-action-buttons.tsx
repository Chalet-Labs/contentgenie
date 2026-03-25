"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { getEpisodeStatus } from "@/app/actions/admin"

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
          setTranscriptMsg("Still fetching — check back later")
          return
        }

        const result = await getEpisodeStatus(episode.id)
        if (!result.ok) {
          clearInterval(transcriptPollRef.current!)
          setTranscriptMsg(result.error)
          return
        }

        setLocalTranscriptStatus(result.transcriptStatus)

        if (
          result.transcriptStatus === "available" ||
          result.transcriptStatus === "failed"
        ) {
          clearInterval(transcriptPollRef.current!)
          setTranscriptMsg(null)
        }
      } catch {
        clearInterval(transcriptPollRef.current!)
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

        setLocalSummaryStatus(result.summaryStatus)

        if (
          result.summaryStatus === "completed" ||
          result.summaryStatus === "failed"
        ) {
          clearInterval(summaryPollRef.current!)
          setSummaryMsg(null)
        }
      } catch {
        clearInterval(summaryPollRef.current!)
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
        throw new Error(await res.text().catch(() => "Request failed"))
      }

      startTranscriptPolling()
    } catch (err) {
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
        throw new Error(await res.text().catch(() => "Request failed"))
      }

      startSummaryPolling()
    } catch (err) {
      setLocalSummaryStatus(previousStatus)
      setSummaryMsg(err instanceof Error ? err.message : "Failed to start summarization")
    }
  }

  const transcriptInProgress =
    localTranscriptStatus === "fetching"

  const summaryInProgress =
    localSummaryStatus === "queued" ||
    localSummaryStatus === "running" ||
    localSummaryStatus === "summarizing"

  const transcriptAvailable = localTranscriptStatus === "available"

  const summarizeLabel =
    localSummaryStatus === "completed" || localSummaryStatus === "failed"
      ? "Re-summarize"
      : "Summarize"

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={transcriptAvailable || transcriptInProgress}
        onClick={handleFetchTranscript}
      >
        {transcriptInProgress ? "Fetching…" : "Fetch Transcript"}
      </Button>

      {transcriptMsg && (
        <span className="text-xs text-muted-foreground">{transcriptMsg}</span>
      )}

      <Button
        size="sm"
        variant="outline"
        disabled={!transcriptAvailable || summaryInProgress}
        onClick={handleSummarize}
      >
        {summaryInProgress ? (localSummaryStatus ?? "Processing…") : summarizeLabel}
      </Button>

      {summaryMsg && (
        <span className="text-xs text-muted-foreground">{summaryMsg}</span>
      )}
    </div>
  )
}
