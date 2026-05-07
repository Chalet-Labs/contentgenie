"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { toast } from "sonner";
import {
  Sparkles,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";
import { triggerTopicDigestRefresh } from "@/app/actions/topics";
import type { TopicDigest } from "@/app/actions/topics";

export interface TopicDigestPanelProps {
  canonicalTopicId: number;
  initialDigest: TopicDigest | null;
  initialRunId: string | null;
  initialAccessToken: string | null;
  canRefresh: boolean;
}

type PanelState =
  | { kind: "idle" }
  | { kind: "loading"; runId: string; accessToken: string }
  | { kind: "ineligible" }
  | { kind: "error"; message: string };

const TERMINAL_FAILURE_STATUSES = new Set([
  "FAILED",
  "CANCELED",
  "TIMED_OUT",
  "SYSTEM_FAILURE",
  "CRASHED",
  "EXPIRED",
]);

export function TopicDigestPanel({
  canonicalTopicId,
  initialDigest,
  initialRunId,
  initialAccessToken,
  canRefresh,
}: TopicDigestPanelProps) {
  const router = useRouter();
  const [state, setState] = useState<PanelState>(() =>
    initialRunId && initialAccessToken
      ? {
          kind: "loading",
          runId: initialRunId,
          accessToken: initialAccessToken,
        }
      : { kind: "idle" },
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const runId = state.kind === "loading" ? state.runId : "";
  const accessToken = state.kind === "loading" ? state.accessToken : "";

  const { run } = useRealtimeRun(runId, {
    accessToken,
    enabled: state.kind === "loading",
  });

  useEffect(() => {
    if (state.kind !== "loading" || !run) return;
    if (run.status === "COMPLETED") {
      router.refresh();
      setState({ kind: "idle" });
      toast.success("Topic synthesis updated");
    } else if (TERMINAL_FAILURE_STATUSES.has(run.status)) {
      setState({
        kind: "error",
        message: `Synthesis failed (${run.status.toLowerCase().replace(/_/g, " ")}). Please retry.`,
      });
      toast.error("Topic synthesis failed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to status transitions
  }, [run?.status]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await triggerTopicDigestRefresh({ canonicalTopicId });
      if (!result.success) {
        toast.error(result.error);
        setState({ kind: "error", message: result.error });
        return;
      }
      const data = result.data;
      if (data.status === "cached") {
        toast.success("Already up to date");
        setState({ kind: "idle" });
      } else if (data.status === "ineligible") {
        setState({ kind: "ineligible" });
      } else if (
        data.status === "queued" &&
        data.runId &&
        data.publicAccessToken
      ) {
        setState({
          kind: "loading",
          runId: data.runId,
          accessToken: data.publicAccessToken,
        });
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle>Topic synthesis</CardTitle>
          </div>
          {canRefresh && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isRefreshing || state.kind === "loading"}
              onClick={() => void handleRefresh()}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Refresh
            </Button>
          )}
        </div>
        {initialDigest && (
          <p className="text-xs text-muted-foreground">
            Generated {formatRelativeTime(initialDigest.generatedAt)} from{" "}
            {initialDigest.episodeCountAtGeneration} episodes (
            {initialDigest.modelUsed})
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {state.kind === "loading" && (
          <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Synthesizing the latest coverage…</span>
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertCircle
              className="mt-0.5 h-4 w-4 text-destructive"
              aria-hidden="true"
            />
            <div className="flex-1">
              <p className="text-destructive">{state.message}</p>
              {canRefresh && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void handleRefresh()}
                >
                  Retry
                </Button>
              )}
            </div>
          </div>
        )}

        {state.kind === "ineligible" && (
          <p className="rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
            Not enough completed episode summaries yet to synthesize this topic.
          </p>
        )}

        {initialDigest && state.kind !== "loading" && (
          <>
            {initialDigest.consensusPoints.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <CheckCircle2
                    className="h-4 w-4 text-emerald-600"
                    aria-hidden="true"
                  />
                  Consensus
                </h3>
                <ul className="list-disc space-y-1 pl-6 text-sm">
                  {initialDigest.consensusPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </section>
            )}

            {initialDigest.disagreementPoints.length > 0 && (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <XCircle
                    className="h-4 w-4 text-amber-600"
                    aria-hidden="true"
                  />
                  Disagreement
                </h3>
                <ul className="list-disc space-y-1 pl-6 text-sm">
                  {initialDigest.disagreementPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </section>
            )}

            <div className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {initialDigest.digestMarkdown}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
