"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { toast } from "sonner";
import { Loader2, ListMusic, Rss, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAudioPlayerState } from "@/contexts/audio-player-context";
import { getQueueEpisodeScores } from "@/app/actions/queue-scores";
import { getScoreColor } from "@/lib/score-utils";
import type { AudioEpisode } from "@/contexts/audio-player-context";
import type { summarizeEpisode } from "@/trigger/summarize-episode";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SummarizeStatus = "loading" | "error";

interface SummarizeState {
  status: SummarizeStatus;
  runId?: string;
  accessToken?: string;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Map state helpers — avoid repeating new Map(prev) + set/delete + return
// ---------------------------------------------------------------------------

function setMapEntry(
  setter: React.Dispatch<React.SetStateAction<Map<string, SummarizeState>>>,
  id: string,
  state: SummarizeState
) {
  setter((prev) => new Map(prev).set(id, state));
}

function deleteMapEntry(
  setter: React.Dispatch<React.SetStateAction<Map<string, SummarizeState>>>,
  id: string
) {
  setter((prev) => {
    const next = new Map(prev);
    next.delete(id);
    return next;
  });
}

// ---------------------------------------------------------------------------
// Inline score badge (smaller than WorthItBadge used on the episode page)
// ---------------------------------------------------------------------------

function QueueScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-semibold text-white",
        getScoreColor(score)
      )}
    >
      {score.toFixed(1)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SummarizeTracker — renders per loading item, holds the useRealtimeRun hook
// ---------------------------------------------------------------------------

interface SummarizeTrackerProps {
  episodeId: string;
  runId: string;
  accessToken: string;
  onScoreReceived: (episodeId: string, score: number) => void;
  onError: (episodeId: string, message: string) => void;
}

const TERMINAL_STATUSES = [
  "FAILED",
  "CANCELED",
  "TIMED_OUT",
  "SYSTEM_FAILURE",
  "CRASHED",
  "EXPIRED",
] as const;

function SummarizeTracker({
  episodeId,
  runId,
  accessToken,
  onScoreReceived,
  onError,
}: SummarizeTrackerProps) {
  const { run } = useRealtimeRun<typeof summarizeEpisode>(runId, {
    accessToken,
    enabled: true,
  });

  const handledRef = useRef(false);

  useEffect(() => {
    if (!run || handledRef.current) return;

    if (run.status === "COMPLETED") {
      handledRef.current = true;
      const score = (run.output as { worthItScore?: number } | undefined)
        ?.worthItScore;
      onScoreReceived(episodeId, typeof score === "number" ? score : 0);
      return;
    }

    if (
      TERMINAL_STATUSES.includes(
        run.status as (typeof TERMINAL_STATUSES)[number]
      )
    ) {
      handledRef.current = true;
      onError(
        episodeId,
        `Summarization ${run.status.toLowerCase().replace(/_/g, " ")}`
      );
    }
  }, [run, episodeId, onScoreReceived, onError]);

  return null;
}

// ---------------------------------------------------------------------------
// QueueEpisodeRow — renders a single episode row
// ---------------------------------------------------------------------------

interface QueueEpisodeRowProps {
  episode: AudioEpisode;
  score: number | null | undefined;
  summarizeState: SummarizeState | undefined;
  isNowPlaying: boolean;
  onGetScore: (episodeId: string) => void;
  onRetry: (episodeId: string) => void;
  onScoreReceived: (episodeId: string, score: number) => void;
  onSummarizeError: (episodeId: string, message: string) => void;
}

function QueueEpisodeRow({
  episode,
  score,
  summarizeState,
  isNowPlaying,
  onGetScore,
  onRetry,
  onScoreReceived,
  onSummarizeError,
}: QueueEpisodeRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-2">
      {/* Artwork */}
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {episode.artwork ? (
          <Image
            src={episode.artwork}
            alt={episode.title}
            fill
            className="object-cover"
            sizes="48px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Rss className="h-5 w-5" />
          </div>
        )}
      </div>

      {/* Title + podcast */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isNowPlaying && (
            <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              Now Playing
            </span>
          )}
          <p className="line-clamp-1 text-sm font-medium">{episode.title}</p>
        </div>
        <p className="line-clamp-1 text-xs text-muted-foreground">
          {episode.podcastTitle}
        </p>
      </div>

      {/* Score / action */}
      <div className="shrink-0">
        {summarizeState?.status === "loading" ? (
          <Loader2
            className="h-4 w-4 animate-spin text-muted-foreground"
            aria-label="Summarizing"
          />
        ) : summarizeState?.status === "error" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => onRetry(episode.id)}
            aria-label="Retry summarization"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        ) : typeof score === "number" ? (
          <QueueScoreBadge score={score} />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onGetScore(episode.id)}
            aria-label={`Get score for ${episode.title}`}
          >
            Get score
          </Button>
        )}
      </div>

      {/* Realtime tracker for in-progress runs */}
      {summarizeState?.status === "loading" &&
        summarizeState.runId &&
        summarizeState.accessToken && (
          <SummarizeTracker
            episodeId={episode.id}
            runId={summarizeState.runId}
            accessToken={summarizeState.accessToken}
            onScoreReceived={onScoreReceived}
            onError={onSummarizeError}
          />
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QueueSection — main export
// ---------------------------------------------------------------------------

export function QueueSection() {
  const { queue, currentEpisode } = useAudioPlayerState();

  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [summarizeStates, setSummarizeStates] = useState<
    Map<string, SummarizeState>
  >(new Map());

  // Ref snapshot of scores for use inside useEffect without adding it as a dep
  const scoresRef = useRef(scores);
  scoresRef.current = scores;

  // Stable key for the current set of episode IDs — avoids object identity churn
  const episodeIdKey = useMemo(
    () =>
      (currentEpisode ? currentEpisode.id : "") +
      "|" +
      queue.map((ep) => ep.id).join(","),
    [currentEpisode, queue]
  );

  // Fetch scores whenever the set of episode IDs changes
  useEffect(() => {
    let cancelled = false;

    const allIds = [
      ...(currentEpisode ? [currentEpisode.id] : []),
      ...queue.map((ep) => ep.id),
    ];

    // Only fetch IDs we don't already have scores for
    const unknownIds = allIds.filter(
      (id) => !Object.hasOwn(scoresRef.current, id)
    );

    if (unknownIds.length === 0) return;

    getQueueEpisodeScores(unknownIds).then((result) => {
      if (!cancelled) {
        setScores((prev) => ({ ...prev, ...result }));
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeIdKey]);

  const handleGetScore = useCallback(async (episodeId: string) => {
    try {
      const res = await fetch("/api/episodes/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: Number(episodeId) }),
      });

      const data = (await res.json()) as Record<string, unknown>;

      if (res.status === 200) {
        // Cached result — apply score immediately, no realtime subscription
        const score = data.worthItScore;
        setScores((prev) => ({
          ...prev,
          [episodeId]: typeof score === "number" ? score : null,
        }));
        return;
      }

      if (res.status === 202) {
        const runId = data.runId as string;
        const accessToken = data.publicAccessToken as string;
        setMapEntry(setSummarizeStates, episodeId, {
          status: "loading",
          runId,
          accessToken,
        });
        return;
      }

      if (res.status === 429) {
        if (typeof data.dailyLimit === "number") {
          toast.error(
            `Daily limit reached. You can summarize up to ${data.dailyLimit} episodes per day.`
          );
        } else {
          toast.error("Rate limit exceeded. Please try again later.");
        }
        setMapEntry(setSummarizeStates, episodeId, {
          status: "error",
          errorMessage: "Rate limited",
        });
        return;
      }

      // Other errors
      const message =
        typeof data.error === "string"
          ? data.error
          : "Failed to start summarization";
      toast.error(message);
      setMapEntry(setSummarizeStates, episodeId, {
        status: "error",
        errorMessage: message,
      });
    } catch {
      toast.error("Network error. Please try again.");
      setMapEntry(setSummarizeStates, episodeId, {
        status: "error",
        errorMessage: "Network error",
      });
    }
  }, []);

  const handleScoreReceived = useCallback(
    (episodeId: string, score: number) => {
      setScores((prev) => ({ ...prev, [episodeId]: score }));
      deleteMapEntry(setSummarizeStates, episodeId);
    },
    []
  );

  const handleSummarizeError = useCallback(
    (episodeId: string, message: string) => {
      setMapEntry(setSummarizeStates, episodeId, {
        status: "error",
        errorMessage: message,
      });
    },
    []
  );

  const handleRetry = useCallback(
    (episodeId: string) => {
      deleteMapEntry(setSummarizeStates, episodeId);
      handleGetScore(episodeId);
    },
    [handleGetScore]
  );

  const isEmpty = !currentEpisode && queue.length === 0;
  const episodeCount = (currentEpisode ? 1 : 0) + queue.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold">Queue</CardTitle>
        {episodeCount > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {episodeCount}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ListMusic className="h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              Your queue is empty
            </p>
            <p className="text-xs text-muted-foreground">
              Add episodes to see them here
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {currentEpisode && (
              <QueueEpisodeRow
                episode={currentEpisode}
                score={scores[currentEpisode.id]}
                summarizeState={summarizeStates.get(currentEpisode.id)}
                isNowPlaying
                onGetScore={handleGetScore}
                onRetry={handleRetry}
                onScoreReceived={handleScoreReceived}
                onSummarizeError={handleSummarizeError}
              />
            )}
            {currentEpisode && queue.length > 0 && (
              <div className="my-2 border-t" />
            )}
            {queue.map((episode) => (
              <QueueEpisodeRow
                key={episode.id}
                episode={episode}
                score={scores[episode.id]}
                summarizeState={summarizeStates.get(episode.id)}
                isNowPlaying={false}
                onGetScore={handleGetScore}
                onRetry={handleRetry}
                onScoreReceived={handleScoreReceived}
                onSummarizeError={handleSummarizeError}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
