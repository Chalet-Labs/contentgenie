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
  type LucideIcon,
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
  autoTriggerError?: string | null;
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

const REFRESH_ERROR_COPY: Record<string, string> = {
  "token-failed": "Couldn't authenticate the synthesis run. Please try again.",
  "trigger-failed": "Couldn't start synthesis. Please try again in a moment.",
  "not-found": "This topic is no longer available.",
  Unauthorized: "Please sign in again to refresh.",
};
const DEFAULT_REFRESH_ERROR = "Couldn't refresh synthesis. Please retry.";

function BulletSection({
  icon: Icon,
  iconClassName,
  title,
  items,
}: {
  icon: LucideIcon;
  iconClassName: string;
  title: string;
  items: readonly string[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icon className={iconClassName} aria-hidden="true" />
        {title}
      </h3>
      <ul className="ml-7 list-disc space-y-1 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function TopicDigestPanel({
  canonicalTopicId,
  initialDigest,
  initialRunId,
  initialAccessToken,
  canRefresh,
  autoTriggerError,
}: TopicDigestPanelProps) {
  const router = useRouter();
  const [state, setState] = useState<PanelState>(() => {
    if (initialRunId && initialAccessToken) {
      return {
        kind: "loading",
        runId: initialRunId,
        accessToken: initialAccessToken,
      };
    }
    if (autoTriggerError && !initialDigest) {
      const message =
        REFRESH_ERROR_COPY[autoTriggerError] ?? DEFAULT_REFRESH_ERROR;
      return { kind: "error", message };
    }
    return { kind: "idle" };
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const runId = state.kind === "loading" ? state.runId : "";
  const accessToken = state.kind === "loading" ? state.accessToken : "";

  const { run, error: realtimeError } = useRealtimeRun(runId, {
    accessToken,
    enabled: state.kind === "loading",
  });

  useEffect(() => {
    if (state.kind !== "loading") return;
    if (realtimeError) {
      console.error("[TopicDigestPanel] realtime subscription error", {
        runId: state.runId,
        error: realtimeError,
      });
      setState({
        kind: "error",
        message: "Lost connection to synthesis run. Please retry.",
      });
      toast.error("Lost connection to synthesis");
      return;
    }
    if (!run) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to status transitions and realtime errors
  }, [run?.status, realtimeError]);

  const handleRefresh = async () => {
    if (isRefreshing || state.kind === "loading") return;
    setIsRefreshing(true);
    try {
      const result = await triggerTopicDigestRefresh({ canonicalTopicId });
      if (!result.success) {
        const message =
          REFRESH_ERROR_COPY[result.error] ?? DEFAULT_REFRESH_ERROR;
        toast.error(message);
        setState({ kind: "error", message });
        return;
      }
      const data = result.data;
      if (data.status === "cached") {
        toast.success("Already up to date");
        setState({ kind: "idle" });
        router.refresh();
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
    } catch (error) {
      console.error("[TopicDigestPanel] refresh threw", {
        canonicalTopicId,
        error,
      });
      const message =
        "Something went wrong while starting the refresh. Please retry.";
      toast.error(message);
      setState({ kind: "error", message });
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
                  disabled={isRefreshing}
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
            <BulletSection
              icon={CheckCircle2}
              iconClassName="h-4 w-4 text-emerald-600"
              title="Consensus"
              items={initialDigest.consensusPoints}
            />

            <BulletSection
              icon={XCircle}
              iconClassName="h-4 w-4 text-amber-600"
              title="Disagreement"
              items={initialDigest.disagreementPoints}
            />

            <div className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {initialDigest.digestMarkdown}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
