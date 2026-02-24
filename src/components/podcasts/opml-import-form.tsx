"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { importOpml } from "@/trigger/import-opml";

type ImportState = "idle" | "uploading" | "processing" | "done" | "error";

interface ImportProgress {
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

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const LARGE_IMPORT_THRESHOLD = 100;

export function OpmlImportForm() {
  const [state, setState] = useState<ImportState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showLargeImportDialog, setShowLargeImportDialog] = useState(false);
  const [pendingFeedCount, setPendingFeedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { run } = useRealtimeRun<typeof importOpml>(runId ?? "", {
    accessToken: accessToken ?? "",
    enabled: !!runId && !!accessToken,
  });

  // React to run status and metadata changes
  useEffect(() => {
    if (!run) return;

    const metadataProgress = (
      run.metadata as { progress?: ImportProgress } | undefined
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
        setState("done");
        toast.success("OPML import complete");
      } else {
        setState("error");
        setErrorMessage(`Import ${run.status.toLowerCase().replace("_", " ")}`);
        toast.error("OPML import failed");
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
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [state]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0] ?? null;
      setFile(selected);
      setErrorMessage(null);
    },
    []
  );

  const startUpload = useCallback(async () => {
    if (!file) return;

    setState("uploading");
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("opmlFile", file);

      const res = await fetch("/api/opml/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.status === 429) {
        setState("error");
        setErrorMessage(
          "Rate limit exceeded. Please wait a few minutes before importing again."
        );
        return;
      }

      if (!res.ok) {
        setState("error");
        setErrorMessage(data.error || "Failed to process OPML file");
        return;
      }

      // All already subscribed — go directly to done
      if (!data.runId) {
        setProgress({
          total: data.total,
          succeeded: 0,
          failed: 0,
          skipped: data.alreadySubscribed,
          completed: data.total,
        });
        setState("done");
        toast.info(
          `All ${data.total} feeds are already in your subscriptions`
        );
        return;
      }

      // Start realtime tracking
      setRunId(data.runId);
      setAccessToken(data.publicAccessToken);
      setProgress({
        total: data.total,
        succeeded: 0,
        failed: 0,
        skipped: data.alreadySubscribed,
        completed: data.alreadySubscribed,
      });
      setState("processing");
    } catch {
      setState("error");
      setErrorMessage("Network error. Please try again.");
    }
  }, [file]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!file) return;

      // Client-side file size validation (before anything else)
      if (file.size > MAX_FILE_SIZE) {
        setErrorMessage("File is too large. Maximum size is 1MB.");
        setState("error");
        return;
      }

      // For large imports, show confirmation dialog
      // We can't know the exact feed count until the server parses it,
      // but we can estimate based on file size (~100 bytes per feed)
      const estimatedFeeds = Math.round(file.size / 100);
      if (estimatedFeeds > LARGE_IMPORT_THRESHOLD) {
        setPendingFeedCount(estimatedFeeds);
        setShowLargeImportDialog(true);
        return;
      }

      startUpload();
    },
    [file, startUpload]
  );

  const handleLargeImportConfirm = useCallback(() => {
    setShowLargeImportDialog(false);
    startUpload();
  }, [startUpload]);

  const handleRetry = useCallback(() => {
    setState("idle");
    setErrorMessage(null);
    setProgress(null);
  }, []);

  const isDisabled = state === "uploading" || state === "processing";

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Upload className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml"
              onChange={handleFileChange}
              disabled={isDisabled}
              className="pl-9 file:mr-2 file:rounded file:border-0 file:bg-transparent file:text-sm file:font-medium"
              aria-label="Select OPML file"
            />
          </div>
          {state === "idle" && (
            <Button
              type="submit"
              variant="outline"
              disabled={!file || isDisabled}
            >
              Import
            </Button>
          )}
          {state === "uploading" && (
            <Button variant="outline" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </Button>
          )}
        </div>

        {state === "processing" && progress && (
          <div
            className="mt-3 space-y-1"
            role="status"
            aria-live="polite"
          >
            <Progress
              value={
                progress.total > 0
                  ? (progress.completed / progress.total) * 100
                  : 0
              }
              className="h-2"
              aria-label="OPML import progress"
            />
            <p className="text-xs text-muted-foreground">
              Importing {progress.completed}/{progress.total} feeds...
            </p>
          </div>
        )}

        {state === "done" && progress && (
          <div className="mt-3 flex items-center gap-2" aria-live="polite">
            <CheckCircle2
              className="h-4 w-4 text-green-600"
              aria-hidden="true"
            />
            <span className="text-sm text-muted-foreground">
              {progress.succeeded} subscribed
              {progress.skipped > 0 && `, ${progress.skipped} already subscribed`}
              {progress.failed > 0 && (
                <span className="text-amber-500">
                  , {progress.failed} failed
                </span>
              )}
            </span>
          </div>
        )}

        {state === "error" && (
          <div
            className="mt-3 flex flex-wrap items-center gap-2"
            aria-live="assertive"
          >
            <XCircle
              className="h-4 w-4 text-destructive"
              aria-hidden="true"
            />
            <span className="text-sm text-destructive">
              {errorMessage || "Something went wrong"}
            </span>
            <Button variant="outline" size="sm" type="button" onClick={handleRetry}>
              Retry
            </Button>
          </div>
        )}
      </form>

      <AlertDialog
        open={showLargeImportDialog}
        onOpenChange={setShowLargeImportDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Large import</AlertDialogTitle>
            <AlertDialogDescription>
              This file may contain around {pendingFeedCount} feeds and could
              take a few minutes to process. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLargeImportConfirm}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
