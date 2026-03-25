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
      transcriptPollCount.current += 1

      if (transcriptPollCount.current >= TRANSCRIPT_POLL_CAP) {
        clearInterval(transcriptPollRef.current!)
        setTranscriptMsg("Still fetching — check back later")
        return
      }

      const status = await getEpisodeStatus(episode.id)
      if (!status) return

      setLocalTranscriptStatus(status.transcriptStatus)

      if (
        status.transcriptStatus === "available" ||
        status.transcriptStatus === "failed"
      ) {
        clearInterval(transcriptPollRef.current!)
        setTranscriptMsg(null)
      }
    }, POLL_INTERVAL_MS)
  }

  const startSummaryPolling = () => {
    summaryPollCount.current = 0
    if (summaryPollRef.current) clearInterval(summaryPollRef.current)

    summaryPollRef.current = setInterval(async () => {
      summaryPollCount.current += 1

      if (summaryPollCount.current >= SUMMARY_POLL_CAP) {
        clearInterval(summaryPollRef.current!)
        setSummaryMsg("Still processing — check back later")
        return
      }

      const status = await getEpisodeStatus(episode.id)
      if (!status) return

      setLocalSummaryStatus(status.summaryStatus)

      if (
        status.summaryStatus === "completed" ||
        status.summaryStatus === "failed"
      ) {
        clearInterval(summaryPollRef.current!)
        setSummaryMsg(null)
      }
    }, POLL_INTERVAL_MS)
  }

  const handleFetchTranscript = async () => {
    setLocalTranscriptStatus("fetching")
    setTranscriptMsg(null)

    try {
      await fetch(`/api/episodes/fetch-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ podcastIndexId: episode.podcastIndexId }),
      })
    } catch {
      // Polling will reflect the actual status
    }

    startTranscriptPolling()
  }

  const handleSummarize = async () => {
    setLocalSummaryStatus("queued")
    setSummaryMsg(null)

    try {
      await fetch(`/api/episodes/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: episode.id }),
      })
    } catch {
      // Polling will reflect the actual status
    }

    startSummaryPolling()
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
