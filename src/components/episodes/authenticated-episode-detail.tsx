"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import {
  ArrowLeft,
  Clock,
  Calendar,
  FileText,
  Mic,
  Rss,
  Play,
  Pause,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  EpisodeTabs,
  EpisodeTabsContent,
  EpisodeTabsList,
  EpisodeTabsTrigger,
} from "@/components/episodes/episode-tabs";
import { EpisodeChaptersList } from "@/components/episodes/episode-chapters-list";
import { useChapters } from "@/hooks/use-chapters";
import { cn, stripHtml } from "@/lib/utils";
import {
  useAudioPlayerState,
  useAudioPlayerAPI,
} from "@/contexts/audio-player-context";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SummaryDisplay,
  type SummarizationStep,
} from "@/components/episodes/summary-display";
import { SaveButton } from "@/components/episodes/save-button";
import { EpisodeExternalActions } from "@/components/episodes/episode-external-actions";
import { AddToQueueButton } from "@/components/audio-player/add-to-queue-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WorthItBadge } from "@/components/episodes/worth-it-badge";
import { EpisodeTranscriptFetchButton } from "@/components/episodes/episode-transcript-fetch-button";
import { CommunityRating } from "@/components/episodes/community-rating";
import { isEpisodeSaved, revalidatePodcastPage } from "@/app/actions/library";
import { getEpisodeTopicOverlap } from "@/app/actions/dashboard";
import type { OverlapLabelKind } from "@/lib/topic-overlap";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { cacheEpisode, getCachedEpisode } from "@/lib/offline-cache";
import { IN_PROGRESS_STATUSES, type TranscriptStatus } from "@/db/schema";
import type { summarizeEpisode } from "@/trigger/summarize-episode";
import type {
  EpisodeData,
  PodcastData,
  SummaryData,
} from "@/components/episodes/episode-detail-shared";
import {
  formatDuration,
  formatPublishDate,
  formatTranscriptSource,
  getEpisodeArtworkUrl,
  getSafeEpisodeLink,
  supportsEpisodeProcessing,
} from "@/components/episodes/episode-detail-shared";
import { asPodcastIndexEpisodeId } from "@/types/ids";

interface AuthenticatedEpisodeDetailProps {
  episodeId: string;
  userId: string;
  isAdmin: boolean;
}

export function AuthenticatedEpisodeDetail({
  episodeId,
  userId,
  isAdmin,
}: AuthenticatedEpisodeDetailProps) {
  const isOnline = useOnlineStatus();
  const playerState = useAudioPlayerState();
  const playerAPI = useAudioPlayerAPI();

  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const normalizedChaptersUrl = episode?.chaptersUrl?.trim() || null;
  const chaptersState = useChapters(normalizedChaptersUrl, isOnline);
  const [podcast, setPodcast] = useState<PodcastData | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [isLoadingEpisode, setIsLoadingEpisode] = useState(true);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [episodeError, setEpisodeError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [transcriptSource, setTranscriptSource] = useState<string | null>(null);
  const [transcriptStatus, setTranscriptStatus] =
    useState<TranscriptStatus | null>(null);
  const [episodeDbId, setEpisodeDbId] = useState<number | null>(null);
  const [overlapResult, setOverlapResult] = useState<{
    label: string | null;
    labelKind: OverlapLabelKind | null;
  }>({ label: null, labelKind: null });
  const canRunEpisodeProcessing = supportsEpisodeProcessing(episodeId);
  // Route param (URL segment) → branded string. Reused for downstream calls
  // that key off the PodcastIndex episode-id namespace.
  const episodeIdBranded = asPodcastIndexEpisodeId(episodeId);

  // Realtime subscription to the Trigger.dev run
  const { run } = useRealtimeRun<typeof summarizeEpisode>(runId ?? "", {
    accessToken: accessToken ?? "",
    enabled: !!runId && !!accessToken,
  });

  // React to run status changes
  useEffect(() => {
    if (!run) return;

    if (run.status === "COMPLETED" && run.output) {
      const completedSummary = {
        summary: run.output.summary,
        keyTakeaways: run.output.keyTakeaways || [],
        worthItScore: run.output.worthItScore,
        worthItReason: run.output.worthItReason,
        worthItDimensions: run.output.worthItDimensions ?? null,
        cached: false,
      };
      setSummaryData(completedSummary);
      if (episode && podcast) {
        void cacheEpisode(userId, episodeId, {
          episode,
          podcast,
          summary: { ...completedSummary, cached: true },
        });
      }
      setIsLoadingSummary(false);
      setRunId(null);
      setAccessToken(null);
      // Invalidate the podcast page so the next navigation picks up fresh scores/status
      if (episode) void revalidatePodcastPage(episode.feedId);
      toast.success("Summary generated!", {
        description: "AI insights are now available for this episode",
      });
    } else if (
      run.status === "FAILED" ||
      run.status === "CANCELED" ||
      run.status === "TIMED_OUT" ||
      run.status === "SYSTEM_FAILURE" ||
      run.status === "CRASHED" ||
      run.status === "EXPIRED"
    ) {
      setSummaryError("Summary generation failed. Please try again.");
      setIsLoadingSummary(false);
      setRunId(null);
      setAccessToken(null);
      toast.error("Failed to generate summary");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to status transitions, not every metadata update
  }, [run?.status]);

  // Fetch episode and podcast data from server
  const fetchEpisodeData = useCallback(async () => {
    setIsLoadingEpisode(true);
    setEpisodeError(null);

    try {
      // Fetch episode from PodcastIndex via API
      const response = await fetch(
        `/api/episodes/${encodeURIComponent(episodeId)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch episode");
      }

      setEpisode(data.episode);
      setPodcast(data.podcast);
      setTranscriptSource(data.transcriptSource ?? null);
      setTranscriptStatus((data.transcriptStatus as TranscriptStatus) ?? null);
      setEpisodeDbId(data.episodeDbId ?? null);

      // Cache episode data for offline use
      void cacheEpisode(userId, episodeId, {
        episode: data.episode,
        podcast: data.podcast,
        summary: data.summary
          ? {
              summary: data.summary.summary,
              keyTakeaways: data.summary.keyTakeaways || [],
              worthItScore: data.summary.worthItScore,
              worthItReason: data.summary.worthItReason,
              worthItDimensions: data.summary.worthItDimensions ?? null,
              cached: true,
            }
          : null,
      });

      // Check if summary exists
      if (data.summary) {
        setSummaryData({
          summary: data.summary.summary,
          keyTakeaways: data.summary.keyTakeaways || [],
          worthItScore: data.summary.worthItScore,
          worthItReason: data.summary.worthItReason,
          worthItDimensions: data.summary.worthItDimensions ?? null,
          cached: true,
        });
      } else {
        setSummaryData(null);
        // Check for in-progress or failed summarization run
        if (canRunEpisodeProcessing) {
          try {
            const statusResponse = await fetch(
              `/api/episodes/summarize?episodeId=${encodeURIComponent(episodeId)}`,
            );
            const statusData = await statusResponse.json();
            if (
              statusData.runId &&
              statusData.publicAccessToken &&
              IN_PROGRESS_STATUSES.includes(statusData.status)
            ) {
              setRunId(statusData.runId);
              setAccessToken(statusData.publicAccessToken);
              setIsLoadingSummary(true);
            } else if (statusData.status === "failed") {
              setSummaryError(
                statusData.processingError ||
                  "Summary generation failed. Please try again.",
              );
              setIsLoadingSummary(false);
            }
          } catch (error) {
            console.warn("Failed to check for in-progress summary run:", error);
          }
        }
      }

      // Check if episode is saved to library
      // PodcastIndex API id (number|string) → branded string.
      const saved = await isEpisodeSaved(
        asPodcastIndexEpisodeId(String(data.episode.id)),
      );
      setIsSaved(saved);
    } catch (error) {
      console.error("Error fetching episode:", error);
      const cached = await getCachedEpisode(userId, episodeId);
      if (cached) {
        setEpisode(cached.episode);
        setPodcast(cached.podcast);
        setSummaryData(cached.summary ?? null);
        return;
      }
      setEpisodeError(
        error instanceof Error ? error.message : "Failed to load episode",
      );
    } finally {
      setIsLoadingEpisode(false);
    }
  }, [canRunEpisodeProcessing, episodeId, userId]);

  // Load episode data from cache
  const loadFromCache = useCallback(async () => {
    setIsLoadingEpisode(true);
    setEpisodeError(null);

    const cached = await getCachedEpisode(userId, episodeId);
    if (cached) {
      setEpisode(cached.episode);
      setPodcast(cached.podcast);
      setSummaryData(cached.summary ?? null);
    } else {
      setSummaryData(null);
      setEpisodeError(
        "This episode hasn't been cached for offline viewing. Visit it while online first.",
      );
    }

    setIsLoadingEpisode(false);
  }, [userId, episodeId]);

  // Load data: online fetches from server, offline from cache.
  // Automatically refreshes data when connectivity returns since
  // isOnline changing from false to true re-triggers this effect.
  useEffect(() => {
    if (isOnline) {
      fetchEpisodeData();
    } else {
      loadFromCache();
    }
  }, [isOnline, fetchEpisodeData, loadFromCache]);

  const episodeLoaded = episode !== null;
  useEffect(() => {
    if (!isOnline || !episodeLoaded) return;
    let ignore = false;
    getEpisodeTopicOverlap(episodeIdBranded)
      .then((result) => {
        if (!ignore)
          setOverlapResult({
            label: result.label,
            labelKind: result.labelKind,
          });
      })
      .catch(() => {
        // Non-critical: overlap label is a presentation-only enhancement
      });
    return () => {
      ignore = true;
    };
  }, [isOnline, episodeLoaded, episodeIdBranded]);

  // Generate summary — triggers a background task and subscribes to realtime updates
  const generateSummary = useCallback(async () => {
    setIsLoadingSummary(true);
    setSummaryError(null);

    try {
      const response = await fetch("/api/episodes/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ episodeId: Number(episodeId) }),
      });

      const data = await response.json();

      if (!response.ok && response.status !== 202) {
        throw new Error(data.error || "Failed to generate summary");
      }

      // If the response is cached (200), display immediately
      if (data.cached) {
        setSummaryData({
          summary: data.summary,
          keyTakeaways: data.keyTakeaways || [],
          worthItScore: data.worthItScore,
          worthItReason: data.worthItReason,
          worthItDimensions: data.worthItDimensions ?? null,
          cached: true,
        });
        setIsLoadingSummary(false);
        return;
      }

      // Otherwise it's a 202 — subscribe to the run for realtime updates
      if (data.runId && data.publicAccessToken) {
        setRunId(data.runId);
        setAccessToken(data.publicAccessToken);
      }
    } catch (error) {
      console.error("Error generating summary:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to generate summary";
      setSummaryError(errorMessage);
      setIsLoadingSummary(false);
      toast.error("Failed to generate summary", {
        description: errorMessage,
      });
    }
  }, [episodeId]);

  // Admin-only: force re-summarization of the current episode
  const resummarize = useCallback(async () => {
    setIsLoadingSummary(true);
    setSummaryError(null);

    try {
      const response = await fetch("/api/episodes/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: Number(episodeId), force: true }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to re-summarize");
      }

      if (data.runId && data.publicAccessToken) {
        setSummaryData(null);
        setRunId(data.runId);
        setAccessToken(data.publicAccessToken);
        toast.info("Re-summarization started");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to re-summarize";
      setSummaryError(errorMessage);
      setIsLoadingSummary(false);
      toast.error("Failed to re-summarize", { description: errorMessage });
    }
  }, [episodeId]);

  // Loading state
  if (isLoadingEpisode) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-5 w-40" />
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="flex flex-row items-center gap-4 md:flex-col md:items-start">
            <Skeleton className="h-48 w-48 shrink-0 rounded-xl" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  // Error state
  if (episodeError || !episode) {
    return (
      <div className="space-y-4">
        {!isOnline && <OfflineBanner isOffline={true} />}
        <Link
          href="/discover"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Discover
        </Link>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">
            {episodeError || "Episode not found"}
          </p>
        </div>
      </div>
    );
  }

  const artworkUrl = getEpisodeArtworkUrl(episode, podcast);
  const safeEpisodeLink = getSafeEpisodeLink(episode.link);
  const categories = podcast?.categories
    ? Object.values(podcast.categories)
    : [];

  // Chapters tab visibility is gated by URL presence, not fetch state — Radix
  // Tabs holds the active value across re-renders, so removing the trigger after
  // a transient empty/error state would leave no panel rendered. The empty case
  // is handled by EpisodeChaptersList's in-panel "No chapters available" copy.
  const hasChapters = normalizedChaptersUrl !== null;
  const descriptionPlainText = stripHtml(episode.description ?? "");
  const hasDescription = Boolean(descriptionPlainText.trim());
  const canPlayEpisode = isOnline && Boolean(episode.enclosureUrl);
  const chaptersCount =
    chaptersState.status === "ready"
      ? chaptersState.chapters.length
      : undefined;

  // PodcastIndex API id (number|string) → branded string.
  const piId = asPodcastIndexEpisodeId(String(episode.id));

  const isCurrentEpisode = playerState.currentEpisode?.id === piId;
  const isPlayingThis = isCurrentEpisode && playerState.isPlaying;
  const isPausedThis = isCurrentEpisode && !playerState.isPlaying;

  const handleListenClick = () => {
    if (isCurrentEpisode) {
      playerAPI.togglePlay();
    } else {
      playerAPI.playEpisode({
        id: piId,
        title: episode.title,
        podcastTitle: podcast?.title || "",
        audioUrl: episode.enclosureUrl,
        artwork: artworkUrl,
        duration: episode.duration,
        chaptersUrl: normalizedChaptersUrl ?? undefined,
      });
    }
  };

  return (
    <div className="space-y-8">
      <OfflineBanner isOffline={!isOnline} />

      {/* Back navigation */}
      <Link
        href={podcast ? `/podcast/${podcast.id}` : "/discover"}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {podcast ? `Back to ${podcast.title}` : "Back to Discover"}
      </Link>

      {/* Episode header */}
      <div className="flex flex-col gap-6 md:flex-row">
        {/* Episode artwork + badge */}
        <div className="flex flex-row items-center gap-4 md:flex-col md:items-start">
          <div className="relative h-48 w-48 shrink-0 overflow-hidden rounded-xl bg-muted shadow-lg">
            {artworkUrl ? (
              <Image
                src={artworkUrl}
                alt={episode.title}
                fill
                className="object-cover"
                sizes="192px"
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <Rss className="h-16 w-16" />
              </div>
            )}
          </div>
          <WorthItBadge score={summaryData?.worthItScore ?? null} />
        </div>

        {/* Episode info */}
        <div className="flex flex-1 flex-col gap-4">
          <div>
            {/* Episode type badge */}
            {episode.episodeType && episode.episodeType !== "full" && (
              <Badge variant="secondary" className="mb-2">
                {episode.episodeType}
              </Badge>
            )}
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              {episode.title}
            </h1>
            {podcast && (
              <Link
                href={`/podcast/${podcast.id}`}
                className="mt-1 text-lg text-muted-foreground hover:text-primary"
              >
                {podcast.title}
              </Link>
            )}
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {categories.slice(0, 4).map((category, index) => (
                <Badge key={index} variant="outline">
                  {category}
                </Badge>
              ))}
            </div>
          )}

          {/* Episode metadata */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{formatPublishDate(episode.datePublished)}</span>
            </div>
            {episode.duration > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{formatDuration(episode.duration)}</span>
              </div>
            )}
            {episode.episode !== null && (
              <div className="flex items-center gap-1">
                <Mic className="h-4 w-4" />
                <span>Episode {episode.episode}</span>
              </div>
            )}
            {episode.season > 0 && <span>Season {episode.season}</span>}
            {/* Admins with no transcript see the fetch button instead */}
            {!(isAdmin && canRunEpisodeProcessing && !transcriptSource) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex items-center gap-1",
                        !transcriptSource && "text-muted-foreground/50",
                      )}
                    >
                      <FileText className="h-4 w-4" />
                      <span>
                        {transcriptSource ? "Transcript" : "No Transcript"}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {transcriptSource
                      ? `Source: ${formatTranscriptSource(transcriptSource)}`
                      : "No transcript available"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {isAdmin && canRunEpisodeProcessing && (
              <EpisodeTranscriptFetchButton
                episodeDbId={episodeDbId}
                podcastIndexId={episodeId}
                transcriptStatus={transcriptStatus}
                onTranscriptReady={async () => {
                  await fetchEpisodeData();
                  await generateSummary();
                }}
              />
            )}
          </div>

          {/* Community Rating */}
          {isOnline && (
            <div>
              <span className="mr-2 text-sm text-muted-foreground">
                Community Rating:
              </span>
              <CommunityRating
                episodePodcastIndexId={episodeIdBranded}
                size="md"
                showCount={true}
              />
            </div>
          )}

          {/* Actions - hide network-dependent actions when offline */}
          <div className="flex flex-wrap gap-3">
            {isOnline && episode.enclosureUrl && (
              <Button size="lg" onClick={handleListenClick}>
                {isPlayingThis ? (
                  <>
                    <Pause className="mr-2 h-4 w-4" />
                    Pause
                  </>
                ) : isPausedThis ? (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Resume
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Listen to Episode
                  </>
                )}
              </Button>
            )}
            {isOnline && episode.enclosureUrl && (
              <AddToQueueButton
                episode={{
                  id: piId,
                  title: episode.title,
                  podcastTitle: podcast?.title || "",
                  audioUrl: episode.enclosureUrl,
                  artwork: artworkUrl,
                  duration: episode.duration,
                  // Known v1 limitation: queue items persisted before this feature
                  // won't carry chaptersUrl. Chapters silently won't load for
                  // queue-initiated playback of older queue entries.
                  chaptersUrl: normalizedChaptersUrl ?? undefined,
                }}
                variant="full"
              />
            )}
            {isOnline && (
              <SaveButton
                episodeData={{
                  podcastIndexId: piId,
                  title: episode.title,
                  description: episode.description,
                  audioUrl: episode.enclosureUrl,
                  duration: episode.duration,
                  publishDate: episode.datePublished
                    ? new Date(episode.datePublished * 1000)
                    : undefined,
                  podcast: {
                    podcastIndexId: String(podcast?.id || episode.feedId),
                    title: podcast?.title || "",
                    description: undefined,
                    publisher: podcast?.author || podcast?.ownerName,
                    imageUrl: podcast?.artwork || podcast?.image,
                    categories: categories,
                  },
                }}
                initialSaved={isSaved}
                size="lg"
              />
            )}
            {isOnline && (
              <EpisodeExternalActions
                episodeId={episodeId}
                episodeTitle={episode.title}
                safeEpisodeLink={safeEpisodeLink}
                shareSummary={summaryData?.worthItReason ?? undefined}
              />
            )}
          </div>
        </div>
      </div>

      <EpisodeTabs key={episodeId} defaultValue="insights">
        <EpisodeTabsList aria-label="Episode sections">
          <EpisodeTabsTrigger value="insights">Insights</EpisodeTabsTrigger>
          {hasChapters && (
            <EpisodeTabsTrigger value="chapters" badge={chaptersCount}>
              Chapters
            </EpisodeTabsTrigger>
          )}
          {hasDescription && (
            <EpisodeTabsTrigger value="about">About</EpisodeTabsTrigger>
          )}
        </EpisodeTabsList>

        <EpisodeTabsContent value="insights">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">AI-Powered Insights</h2>
            {isAdmin &&
              canRunEpisodeProcessing &&
              summaryData?.summary &&
              isOnline &&
              !isLoadingSummary && (
                <Button variant="outline" size="sm" onClick={resummarize}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Re-summarize
                </Button>
              )}
          </div>
          <SummaryDisplay
            summary={summaryData?.summary || null}
            keyTakeaways={summaryData?.keyTakeaways || null}
            worthItScore={summaryData?.worthItScore ?? null}
            worthItReason={summaryData?.worthItReason}
            worthItDimensions={summaryData?.worthItDimensions}
            isLoading={isLoadingSummary}
            error={summaryError}
            currentStep={
              (run?.metadata?.step as SummarizationStep | undefined) ?? null
            }
            onGenerateSummary={
              isOnline && canRunEpisodeProcessing ? generateSummary : undefined
            }
            overlapLabel={overlapResult.label}
            overlapLabelKind={overlapResult.labelKind}
          />
        </EpisodeTabsContent>

        {hasChapters && (
          <EpisodeTabsContent value="chapters">
            <Card>
              <CardContent className="p-4">
                <EpisodeChaptersList
                  state={chaptersState}
                  canPlay={canPlayEpisode}
                  audioEpisode={{
                    id: piId,
                    title: episode.title,
                    podcastTitle: podcast?.title || "",
                    audioUrl: episode.enclosureUrl,
                    artwork: artworkUrl,
                    duration: episode.duration,
                    chaptersUrl: normalizedChaptersUrl ?? undefined,
                  }}
                />
              </CardContent>
            </Card>
          </EpisodeTabsContent>
        )}

        {hasDescription && (
          <EpisodeTabsContent value="about">
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 text-lg font-semibold">
                  About This Episode
                </h2>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {descriptionPlainText}
                </p>
              </CardContent>
            </Card>
          </EpisodeTabsContent>
        )}
      </EpisodeTabs>
    </div>
  );
}
