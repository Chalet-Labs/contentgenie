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
  Mic,
  Rss,
  ExternalLink,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { stripHtml } from "@/lib/utils";
import { useAudioPlayerState, useAudioPlayerAPI } from "@/contexts/audio-player-context";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SummaryDisplay,
  type SummarizationStep,
} from "@/components/episodes/summary-display";
import { SaveButton } from "@/components/episodes/save-button";
import { CommunityRating } from "@/components/episodes/community-rating";
import { isEpisodeSaved } from "@/app/actions/library";
import { IN_PROGRESS_STATUSES } from "@/db/schema";
import type { summarizeEpisode } from "@/trigger/summarize-episode";

interface EpisodePageProps {
  params: {
    id: string;
  };
}

interface EpisodeData {
  id: number;
  title: string;
  description: string;
  datePublished: number;
  duration: number;
  enclosureUrl: string;
  episode: number | null;
  episodeType: string;
  season: number;
  feedId: number;
  feedImage: string;
  image: string;
  link: string;
}

interface PodcastData {
  id: number;
  title: string;
  author: string;
  ownerName: string;
  image: string;
  artwork: string;
  categories: Record<string, string>;
}

interface SummaryData {
  summary: string;
  keyTakeaways: string[];
  worthItScore: number;
  worthItReason?: string;
  cached: boolean;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "Unknown";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatPublishDate(timestamp: number): string {
  if (!timestamp) return "Unknown";
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function EpisodePage({ params }: EpisodePageProps) {
  const episodeId = params.id;
  const playerState = useAudioPlayerState();
  const playerAPI = useAudioPlayerAPI();

  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const [podcast, setPodcast] = useState<PodcastData | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [isLoadingEpisode, setIsLoadingEpisode] = useState(true);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [episodeError, setEpisodeError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Realtime subscription to the Trigger.dev run
  const { run } = useRealtimeRun<typeof summarizeEpisode>(runId ?? "", {
    accessToken: accessToken ?? "",
    enabled: !!runId && !!accessToken,
  });

  // React to run status changes
  useEffect(() => {
    if (!run) return;

    if (run.status === "COMPLETED" && run.output) {
      setSummaryData({
        summary: run.output.summary,
        keyTakeaways: run.output.keyTakeaways || [],
        worthItScore: run.output.worthItScore,
        worthItReason: run.output.worthItReason,
        cached: false,
      });
      setIsLoadingSummary(false);
      setRunId(null);
      setAccessToken(null);
      toast.success("Summary generated!", {
        description: "AI insights are now available for this episode",
      });
    } else if (run.status === "FAILED" || run.status === "CANCELED" || run.status === "TIMED_OUT" || run.status === "SYSTEM_FAILURE" || run.status === "CRASHED" || run.status === "EXPIRED") {
      setSummaryError("Summary generation failed. Please try again.");
      setIsLoadingSummary(false);
      setRunId(null);
      setAccessToken(null);
      toast.error("Failed to generate summary");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to status transitions, not every metadata update
  }, [run?.status]);

  // Fetch episode and podcast data
  useEffect(() => {
    async function fetchEpisodeData() {
      setIsLoadingEpisode(true);
      setEpisodeError(null);

      try {
        // Fetch episode from PodcastIndex via API
        const response = await fetch(
          `/api/episodes/${episodeId}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch episode");
        }

        setEpisode(data.episode);
        setPodcast(data.podcast);

        // Check if summary exists
        if (data.summary) {
          setSummaryData({
            summary: data.summary.summary,
            keyTakeaways: data.summary.keyTakeaways || [],
            worthItScore: data.summary.worthItScore,
            worthItReason: data.summary.worthItReason,
            cached: true,
          });
        } else {
          // Check for in-progress or failed summarization run
          try {
            const statusResponse = await fetch(
              `/api/episodes/summarize?episodeId=${episodeId}`
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
                  "Summary generation failed. Please try again."
              );
              setIsLoadingSummary(false);
            }
          } catch (error) {
            console.warn("Failed to check for in-progress summary run:", error);
          }
        }

        // Check if episode is saved to library
        const saved = await isEpisodeSaved(String(data.episode.id));
        setIsSaved(saved);
      } catch (error) {
        console.error("Error fetching episode:", error);
        setEpisodeError(
          error instanceof Error ? error.message : "Failed to load episode"
        );
      } finally {
        setIsLoadingEpisode(false);
      }
    }

    fetchEpisodeData();
  }, [episodeId]);

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

  // Loading state
  if (isLoadingEpisode) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-5 w-40" />
        <div className="flex flex-col gap-6 md:flex-row">
          <Skeleton className="h-48 w-48 shrink-0 rounded-xl" />
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

  const artworkUrl = episode.image || episode.feedImage || podcast?.artwork || podcast?.image;
  const categories = podcast?.categories ? Object.values(podcast.categories) : [];

  const isCurrentEpisode = playerState.currentEpisode?.id === String(episode.id);
  const isPlayingThis = isCurrentEpisode && playerState.isPlaying;
  const isPausedThis = isCurrentEpisode && !playerState.isPlaying;

  const handleListenClick = () => {
    if (isCurrentEpisode) {
      playerAPI.togglePlay();
    } else {
      playerAPI.playEpisode({
        id: String(episode.id),
        title: episode.title,
        podcastTitle: podcast?.title || "",
        audioUrl: episode.enclosureUrl,
        artwork: artworkUrl,
        duration: episode.duration,
      });
    }
  };

  return (
    <div className="space-y-8">
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
        {/* Episode artwork */}
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
          </div>

          {/* Community Rating */}
          <div>
            <span className="mr-2 text-sm text-muted-foreground">Community Rating:</span>
            <CommunityRating episodePodcastIndexId={episodeId} size="md" showCount={true} />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            {episode.enclosureUrl && (
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
            <SaveButton
              episodeData={{
                podcastIndexId: String(episode.id),
                title: episode.title,
                description: episode.description,
                audioUrl: episode.enclosureUrl,
                duration: episode.duration,
                publishDate: episode.datePublished ? new Date(episode.datePublished * 1000) : undefined,
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
            {episode.link && (
              <Button variant="outline" size="lg" asChild>
                <a
                  href={episode.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Episode Page
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {episode.description && (
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-3 text-lg font-semibold">About This Episode</h2>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {stripHtml(episode.description)}
            </p>
          </CardContent>
        </Card>
      )}

      {/* AI Summary Section */}
      <div>
        <h2 className="mb-4 text-xl font-semibold">AI-Powered Insights</h2>
        <SummaryDisplay
          summary={summaryData?.summary || null}
          keyTakeaways={summaryData?.keyTakeaways || null}
          worthItScore={summaryData?.worthItScore ?? null}
          worthItReason={summaryData?.worthItReason}
          isLoading={isLoadingSummary}
          error={summaryError}
          currentStep={
            (run?.metadata?.step as SummarizationStep | undefined) ?? null
          }
          onGenerateSummary={generateSummary}
        />
      </div>
    </div>
  );
}
