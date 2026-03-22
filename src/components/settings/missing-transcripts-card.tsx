"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  getEpisodeTranscriptStats,
  type TranscriptStatsEpisode,
} from "@/app/actions/transcript-stats";
import { ADMIN_ROLE } from "@/lib/auth-roles";
import type { TranscriptStatus } from "@/db/schema";

type CardState = "idle" | "loading" | "error";

const PAGE_SIZE = 10;

export function StatusBadge({ status }: { status: TranscriptStatus | null }) {
  if (!status) {
    return <Badge variant="secondary">Not attempted</Badge>;
  }
  if (status === "missing") {
    return <Badge variant="outline">Missing</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  if (status === "fetching") {
    return (
      <Badge variant="secondary" title="May be stale if the previous run crashed">
        Fetching... (stale?)
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
}

export function MissingTranscriptsCard() {
  const { has, isLoaded } = useAuth();

  const [state, setState] = useState<CardState>("idle");
  const [totalMissing, setTotalMissing] = useState(0);
  const [episodes, setEpisodes] = useState<TranscriptStatsEpisode[]>([]);
  const [podcasts, setPodcasts] = useState<Array<{ id: number; title: string }>>([]);
  const [selectedPodcastId, setSelectedPodcastId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fetchingIds, setFetchingIds] = useState<Set<number>>(new Set());
  const [isBatchFetching, setIsBatchFetching] = useState(false);

  const isAdmin = isLoaded && has?.({ role: ADMIN_ROLE });

  const parsePodcastId = (value: string) =>
    value && value !== "all" ? Number(value) : undefined;

  const loadStats = useCallback(async (
    podcastId?: number,
    currentPage = 1,
    opts?: { append?: boolean; skipPodcasts?: boolean },
  ) => {
    setState("loading");
    try {
      const result = await getEpisodeTranscriptStats({
        page: currentPage,
        pageSize: PAGE_SIZE,
        podcastId,
        skipPodcasts: opts?.skipPodcasts,
      });

      if (result.error) {
        setState("error");
        return;
      }

      setTotalMissing(result.totalMissing);
      if (result.podcasts.length > 0) setPodcasts(result.podcasts);
      setEpisodes((prev) => opts?.append ? [...prev, ...result.episodes] : result.episodes);
      setHasMore(result.episodes.length === PAGE_SIZE);
      setState("idle");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isAdmin) {
      loadStats();
    }
  }, [isLoaded, isAdmin, loadStats]);

  const handlePodcastChange = useCallback((value: string) => {
    setSelectedPodcastId(value);
    setPage(1);
    setEpisodes([]);
    loadStats(parsePodcastId(value), 1, { skipPodcasts: true });
  }, [loadStats]);

  const handleRefresh = useCallback(() => {
    setPage(1);
    setEpisodes([]);
    loadStats(parsePodcastId(selectedPodcastId), 1);
  }, [loadStats, selectedPodcastId]);

  const handleLoadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadStats(parsePodcastId(selectedPodcastId), nextPage, { append: true, skipPodcasts: true });
  }, [loadStats, page, selectedPodcastId]);

  const handleFetchOne = useCallback(async (episodeId: number) => {
    setFetchingIds((prev) => new Set(prev).add(episodeId));
    try {
      const res = await fetch("/api/episodes/fetch-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to trigger transcript fetch");
        return;
      }
      // Optimistically update status in list
      setEpisodes((prev) =>
        prev.map((ep) =>
          ep.id === episodeId ? { ...ep, transcriptStatus: "fetching" } : ep
        )
      );
      toast.success("Transcript fetch triggered");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setFetchingIds((prev) => {
        const next = new Set(prev);
        next.delete(episodeId);
        return next;
      });
    }
  }, []);

  const handleFetchAll = useCallback(async () => {
    if (episodes.length === 0) return;
    const ids = episodes.map((ep) => ep.id).slice(0, 20);
    setIsBatchFetching(true);
    try {
      const res = await fetch("/api/episodes/batch-fetch-transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to trigger batch transcript fetch");
        return;
      }
      // Optimistically update all visible rows
      const triggeredIds = new Set(ids);
      setEpisodes((prev) =>
        prev.map((ep) =>
          triggeredIds.has(ep.id) ? { ...ep, transcriptStatus: "fetching" } : ep
        )
      );
      toast.success(`Triggered fetch for ${ids.length} episodes`);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setIsBatchFetching(false);
    }
  }, [episodes]);

  if (!isLoaded || !isAdmin) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <CardTitle>Missing Transcripts</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={state === "loading"}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${state === "loading" ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <CardDescription>
          {state === "loading" && episodes.length === 0
            ? "Loading..."
            : `${totalMissing} episode${totalMissing !== 1 ? "s" : ""} missing transcripts`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Select
              value={selectedPodcastId || "all"}
              onValueChange={handlePodcastChange}
              disabled={state === "loading"}
            >
              <SelectTrigger>
                <SelectValue placeholder="All podcasts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All podcasts</SelectItem>
                {podcasts.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronUp className="mr-1 h-4 w-4" />
                Hide list
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-4 w-4" />
                Show list
              </>
            )}
          </Button>
        </div>

        {expanded && (
          <div className="space-y-3">
            {state === "loading" && episodes.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading episodes...
              </div>
            )}

            {state === "error" && (
              <p className="text-sm text-destructive">Failed to load episodes. Try refreshing.</p>
            )}

            {episodes.length === 0 && state === "idle" && (
              <p className="text-sm text-muted-foreground">No episodes with missing transcripts.</p>
            )}

            {episodes.length > 0 && (
              <>
                <div className="space-y-2">
                  {episodes.map((ep) => (
                    <div
                      key={ep.id}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-medium leading-snug truncate" title={ep.title}>
                          {ep.title}
                        </p>
                        <p className="text-muted-foreground truncate">{ep.podcastTitle}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={ep.transcriptStatus} />
                          {ep.publishDate && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(ep.publishDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {ep.transcriptError && (
                          <p className="text-xs text-destructive truncate" title={ep.transcriptError}>
                            {ep.transcriptError}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleFetchOne(ep.id)}
                        disabled={fetchingIds.has(ep.id) || isBatchFetching}
                        className="shrink-0"
                      >
                        {fetchingIds.has(ep.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Fetch"
                        )}
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {hasMore && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLoadMore}
                      disabled={state === "loading"}
                    >
                      {state === "loading" ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        "Load More"
                      )}
                    </Button>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleFetchAll}
                    disabled={isBatchFetching || state === "loading" || episodes.length === 0}
                  >
                    {isBatchFetching ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Fetching...
                      </>
                    ) : (
                      `Fetch All (${Math.min(episodes.length, 20)})`
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
