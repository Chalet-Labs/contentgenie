"use client";

import { useState, useEffect, useCallback } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sparkles, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getUserSubscriptions } from "@/app/actions/subscriptions";
import { getResummarizeEpisodeCount } from "@/app/actions/bulk-resummarize";
import type { bulkResummarize } from "@/trigger/bulk-resummarize";

type CardState = "idle" | "confirming" | "processing" | "done" | "error";

interface BulkProgress {
  total: number;
  completed: number;
  failed: number;
  currentChunk: number;
  totalChunks: number;
}

interface PodcastOption {
  id: number;
  title: string;
}

const TERMINAL_STATUSES = [
  "COMPLETED",
  "FAILED",
  "CANCELED",
  "TIMED_OUT",
  "SYSTEM_FAILURE",
  "CRASHED",
  "EXPIRED",
] as const;

export function BulkResummarizeCard() {
  const [state, setState] = useState<CardState>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [finalResult, setFinalResult] = useState<{
    total: number;
    succeeded: number;
    failed: number;
  } | null>(null);

  // Filter state
  const [podcastId, setPodcastId] = useState<string>("");
  const [minDate, setMinDate] = useState("");
  const [maxDate, setMaxDate] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [allEpisodes, setAllEpisodes] = useState(false);

  // Confirmation state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState(0);
  const [isEstimating, setIsEstimating] = useState(false);

  // Podcast options
  const [podcasts, setPodcasts] = useState<PodcastOption[]>([]);

  // Load subscriptions for podcast dropdown
  useEffect(() => {
    async function loadPodcasts() {
      const { subscriptions } = await getUserSubscriptions();
      setPodcasts(
        subscriptions.map((sub) => ({
          id: sub.podcast.id,
          title: sub.podcast.title,
        }))
      );
    }
    loadPodcasts();
  }, []);

  const { run } = useRealtimeRun<typeof bulkResummarize>(runId ?? "", {
    accessToken: accessToken ?? "",
    enabled: !!runId && !!accessToken,
  });

  // React to run status and metadata changes
  useEffect(() => {
    if (!run) return;

    const metadataProgress = (
      run.metadata as { progress?: BulkProgress } | undefined
    )?.progress;
    if (metadataProgress) {
      setProgress(metadataProgress);
    }

    if (
      TERMINAL_STATUSES.includes(
        run.status as (typeof TERMINAL_STATUSES)[number]
      )
    ) {
      if (run.status === "COMPLETED") {
        const output = run.output as {
          total: number;
          succeeded: number;
          failed: number;
        } | undefined;
        setFinalResult(output ?? null);
        setState("done");
        toast.success("Bulk re-summarization complete");
      } else {
        setState("error");
        setErrorMessage(`Bulk run ${run.status.toLowerCase().replace(/_/g, " ")}`);
        toast.error("Bulk re-summarization failed");
      }
      setRunId(null);
      setAccessToken(null);
    }
  }, [run]);

  // Auto-dismiss done state after 5 seconds
  useEffect(() => {
    if (state !== "done") return;
    const timer = setTimeout(() => {
      setState("idle");
      setProgress(null);
      setFinalResult(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [state]);

  const buildFilters = useCallback(() => {
    const filters: {
      podcastId?: number;
      minDate?: string;
      maxDate?: string;
      maxScore?: number;
      all?: boolean;
    } = {};

    if (podcastId) {
      filters.podcastId = Number(podcastId);
    }
    if (minDate) {
      filters.minDate = minDate;
    }
    if (maxDate) {
      filters.maxDate = maxDate;
    }
    if (maxScore) {
      filters.maxScore = Number(maxScore);
    }
    if (allEpisodes) {
      filters.all = true;
    }

    return filters;
  }, [podcastId, minDate, maxDate, maxScore, allEpisodes]);

  const handleResummarize = useCallback(async () => {
    const filters = buildFilters();

    // Must have at least one filter or all: true
    const hasFilter =
      filters.podcastId !== undefined ||
      filters.minDate !== undefined ||
      filters.maxDate !== undefined ||
      filters.maxScore !== undefined;

    if (!hasFilter && !filters.all) {
      setErrorMessage("Select at least one filter, or check 'Re-summarize all episodes'");
      setState("error");
      return;
    }

    // Get episode count estimate for confirmation
    setIsEstimating(true);
    const { count, error } = await getResummarizeEpisodeCount(filters);
    setIsEstimating(false);

    if (error) {
      setErrorMessage(error);
      setState("error");
      return;
    }

    if (count === 0) {
      toast.info("No episodes match the selected filters");
      return;
    }

    setEstimatedCount(count);
    setShowConfirmDialog(true);
  }, [buildFilters]);

  const handleConfirm = useCallback(async () => {
    setShowConfirmDialog(false);
    setState("processing");
    setErrorMessage(null);

    try {
      const filters = buildFilters();
      const res = await fetch("/api/episodes/bulk-resummarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });

      const data = await res.json();

      if (res.status === 429) {
        setState("error");
        setErrorMessage("Rate limit exceeded. Only 1 bulk re-summarization per hour.");
        return;
      }

      if (!res.ok) {
        setState("error");
        setErrorMessage(data.error || "Failed to start bulk re-summarization");
        return;
      }

      setRunId(data.runId);
      setAccessToken(data.publicAccessToken);
      setProgress({
        total: data.estimatedEpisodes,
        completed: 0,
        failed: 0,
        currentChunk: 0,
        totalChunks: 1,
      });
    } catch {
      setState("error");
      setErrorMessage("Network error. Please try again.");
    }
  }, [buildFilters]);

  const handleCancel = useCallback(async () => {
    if (!runId) return;

    try {
      await fetch("/api/episodes/bulk-resummarize", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      setState("idle");
      setRunId(null);
      setAccessToken(null);
      setProgress(null);
      toast.info("Bulk re-summarization canceled");
    } catch {
      toast.error("Failed to cancel");
    }
  }, [runId]);

  const handleRetry = useCallback(() => {
    setState("idle");
    setErrorMessage(null);
    setProgress(null);
    setFinalResult(null);
  }, []);

  const hasFilter = podcastId || minDate || maxDate || maxScore || allEpisodes;
  const isProcessing = state === "processing";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Summaries
          </CardTitle>
          <CardDescription>
            Re-generate AI summaries for your episodes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(state === "idle" || state === "error") && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Podcast</label>
                  <Select
                    value={podcastId}
                    onValueChange={setPodcastId}
                    disabled={allEpisodes}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All podcasts" />
                    </SelectTrigger>
                    <SelectContent>
                      {podcasts.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Max quality score</label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    placeholder="e.g. 5 (re-summarize low scores)"
                    value={maxScore}
                    onChange={(e) => setMaxScore(e.target.value)}
                    disabled={allEpisodes}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Published after</label>
                  <Input
                    type="date"
                    value={minDate}
                    onChange={(e) => setMinDate(e.target.value)}
                    disabled={allEpisodes}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Published before</label>
                  <Input
                    type="date"
                    value={maxDate}
                    onChange={(e) => setMaxDate(e.target.value)}
                    disabled={allEpisodes}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="all-episodes"
                  checked={allEpisodes}
                  onChange={(e) => {
                    setAllEpisodes(e.target.checked);
                    if (e.target.checked) {
                      setPodcastId("");
                      setMinDate("");
                      setMaxDate("");
                      setMaxScore("");
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="all-episodes" className="text-sm font-medium">
                  Re-summarize all episodes
                </label>
              </div>

              {state === "error" && (
                <div
                  className="flex flex-wrap items-center gap-2"
                  aria-live="assertive"
                >
                  <XCircle
                    className="h-4 w-4 text-destructive"
                    aria-hidden="true"
                  />
                  <span className="text-sm text-destructive">
                    {errorMessage || "Something went wrong"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={handleRetry}
                  >
                    Clear
                  </Button>
                </div>
              )}

              <Button
                onClick={handleResummarize}
                disabled={!hasFilter || isEstimating}
              >
                {isEstimating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Re-Summarize
                  </>
                )}
              </Button>
            </>
          )}

          {state === "processing" && progress && (
            <div className="space-y-3" role="status" aria-live="polite">
              <Progress
                value={
                  progress.total > 0
                    ? ((progress.completed + progress.failed) / progress.total) * 100
                    : 0
                }
                className="h-2"
                aria-label="Bulk re-summarization progress"
              />
              <p className="text-sm text-muted-foreground">
                {progress.completed} of {progress.total} completed
                {progress.failed > 0 && (
                  <span className="text-amber-500">
                    , {progress.failed} failed
                  </span>
                )}
              </p>
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          )}

          {state === "done" && (
            <div className="flex items-center gap-2" aria-live="polite">
              <CheckCircle2
                className="h-4 w-4 text-green-600"
                aria-hidden="true"
              />
              <span className="text-sm text-muted-foreground">
                {finalResult
                  ? `${finalResult.succeeded} re-summarized${finalResult.failed > 0 ? `, ${finalResult.failed} failed` : ""}`
                  : "Complete"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {allEpisodes
                ? "Re-summarize ALL episodes?"
                : "Re-summarize episodes?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {allEpisodes ? (
                <>
                  This will re-generate AI summaries for <strong>all {estimatedCount}</strong> previously summarized episodes. This uses AI credits and may take a while.
                </>
              ) : (
                <>
                  This will re-generate AI summaries for <strong>{estimatedCount}</strong> episodes matching your filters. This uses AI credits and may take a while.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Re-Summarize {estimatedCount} episodes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
