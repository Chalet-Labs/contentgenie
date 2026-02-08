"use client";

import { useState, useEffect, useCallback } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { batchSummarizeEpisodes } from "@/trigger/batch-summarize-episodes";

type BatchState = "idle" | "confirming" | "processing" | "done" | "error";

interface BatchProgress {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  completed: number;
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

interface BatchSummarizeButtonProps {
  episodeIds: (number | string)[];
}

export function BatchSummarizeButton({
  episodeIds,
}: BatchSummarizeButtonProps) {
  const [state, setState] = useState<BatchState>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { run } = useRealtimeRun<typeof batchSummarizeEpisodes>(runId ?? "", {
    accessToken: accessToken ?? "",
    enabled: !!runId && !!accessToken,
  });

  // React to run status and metadata changes
  useEffect(() => {
    if (!run) return;

    // Update progress from run metadata
    const metadataProgress = (
      run.metadata as { progress?: BatchProgress } | undefined
    )?.progress;
    if (metadataProgress) {
      setProgress(metadataProgress);
    }

    // Check for terminal states
    if (
      TERMINAL_STATUSES.includes(
        run.status as (typeof TERMINAL_STATUSES)[number]
      )
    ) {
      if (run.status === "COMPLETED") {
        setState("done");
        toast.success("Batch summarization complete");
      } else {
        setState("error");
        setErrorMessage(`Batch run ${run.status.toLowerCase().replace("_", " ")}`);
        toast.error("Batch summarization failed");
      }
      setRunId(null);
      setAccessToken(null);
    }
  }, [run?.status, run?.metadata]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss done state after 5 seconds
  useEffect(() => {
    if (state !== "done") return;
    const timer = setTimeout(() => {
      setState("idle");
      setProgress(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [state]);

  const handleConfirm = useCallback(async () => {
    setState("processing");
    setErrorMessage(null);

    try {
      const numericIds = episodeIds.map(Number);
      const res = await fetch("/api/episodes/batch-summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeIds: numericIds }),
      });

      const data = await res.json();

      if (res.status === 429) {
        setState("error");
        setErrorMessage("Rate limit exceeded. Please try again later.");
        return;
      }

      if (!res.ok) {
        setState("error");
        setErrorMessage(data.error || "Failed to start batch summarization");
        return;
      }

      // All cached — go directly to done
      if (data.alreadyCached) {
        setProgress({
          total: data.total,
          succeeded: 0,
          failed: 0,
          skipped: data.skipped,
          completed: data.total,
        });
        setState("done");
        toast.info("All episodes already summarized");
        return;
      }

      // Start realtime tracking
      setRunId(data.runId);
      setAccessToken(data.publicAccessToken);
      setProgress({
        total: data.total,
        succeeded: 0,
        failed: 0,
        skipped: data.skipped,
        completed: data.skipped,
      });
    } catch {
      setState("error");
      setErrorMessage("Network error. Please try again.");
    }
  }, [episodeIds]);

  const numericIds = episodeIds.map(Number).filter((id) => id > 0);

  if (state === "idle") {
    return (
      <Button
        variant="outline"
        size="lg"
        onClick={() => setState("confirming")}
        disabled={numericIds.length === 0}
      >
        <Sparkles className="mr-2 h-4 w-4" />
        Summarize Recent
      </Button>
    );
  }

  if (state === "confirming") {
    return (
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        <span className="text-sm text-muted-foreground">
          Summarize {numericIds.length} episodes?
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setState("idle")}
          aria-label="Cancel batch summarization"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          aria-label={`Confirm summarizing ${numericIds.length} episodes`}
        >
          Confirm
        </Button>
      </div>
    );
  }

  if (state === "processing") {
    const completed = progress?.completed ?? 0;
    const total = progress?.total ?? numericIds.length;
    const pct = total > 0 ? (completed / total) * 100 : 0;

    return (
      <div
        className="flex items-center gap-3 min-w-[200px]"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
        <div className="flex-1 space-y-1">
          <Progress value={pct} className="h-2" aria-label="Batch summarization progress" />
          <p className="text-xs text-muted-foreground">
            Processing {completed}/{total} episodes...
          </p>
        </div>
      </div>
    );
  }

  if (state === "done") {
    const succeeded = progress?.succeeded ?? 0;
    const skipped = progress?.skipped ?? 0;
    const failed = progress?.failed ?? 0;

    return (
      <div className="flex items-center gap-2" aria-live="polite">
        <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">
          {succeeded} summarized, {skipped} skipped
          {failed > 0 && (
            <span className="text-amber-500"> , {failed} failed</span>
          )}
        </span>
      </div>
    );
  }

  // error state
  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="assertive">
      <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
      <span className="text-sm text-destructive">
        {errorMessage || "Something went wrong"}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setState("idle");
          setErrorMessage(null);
          setProgress(null);
        }}
      >
        Retry
      </Button>
    </div>
  );
}
