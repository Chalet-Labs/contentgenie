"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  Mic,
  Rss,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CommunityRating } from "@/components/episodes/community-rating";
import { PublicEpisodeCTA } from "@/components/episodes/public-episode-cta";
import { SummaryDisplay } from "@/components/episodes/summary-display";
import { WorthItBadge } from "@/components/episodes/worth-it-badge";
import { ShareButton } from "@/components/ui/share-button";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { stripHtml } from "@/lib/utils";
import type {
  EpisodeData,
  PodcastData,
  SummaryData,
} from "@/components/episodes/episode-detail-shared";
import {
  buildSignUpHref,
  formatDuration,
  formatPublishDate,
  getEpisodeArtworkUrl,
  getSafeEpisodeLink,
} from "@/components/episodes/episode-detail-shared";

interface PublicEpisodeDetailProps {
  episodeId: string;
}

export function PublicEpisodeDetail({
  episodeId,
}: PublicEpisodeDetailProps) {
  const isOnline = useOnlineStatus();

  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const [podcast, setPodcast] = useState<PodcastData | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [isLoadingEpisode, setIsLoadingEpisode] = useState(true);
  const [episodeError, setEpisodeError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function fetchEpisodeData() {
      setIsLoadingEpisode(true);
      setEpisodeError(null);

      try {
        const response = await fetch(
          `/api/episodes/${encodeURIComponent(episodeId)}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch episode");
        }

        if (ignore) return;

        setEpisode(data.episode);
        setPodcast(data.podcast);
        setSummaryData(
          data.summary
            ? {
                summary: data.summary.summary,
                keyTakeaways: data.summary.keyTakeaways || [],
                worthItScore: data.summary.worthItScore,
                worthItReason: data.summary.worthItReason,
                worthItDimensions: data.summary.worthItDimensions ?? null,
                cached: true,
              }
            : null
        );
      } catch (error) {
        if (ignore) return;

        setEpisode(null);
        setPodcast(null);
        setSummaryData(null);
        setEpisodeError(
          error instanceof Error ? error.message : "Failed to load episode"
        );
      } finally {
        if (!ignore) {
          setIsLoadingEpisode(false);
        }
      }
    }

    void fetchEpisodeData();

    return () => {
      ignore = true;
    };
  }, [episodeId]);

  if (isLoadingEpisode) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-5 w-40" />
        <div className="flex flex-col gap-6 md:flex-row">
          <Skeleton className="h-48 w-48 rounded-xl" />
          <div className="flex flex-1 flex-col gap-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (episodeError || !episode) {
    return (
      <div className="space-y-4">
        {!isOnline && <OfflineBanner isOffline={true} />}
        <Link
          href={buildSignUpHref("/discover")}
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
  const categories = podcast?.categories ? Object.values(podcast.categories) : [];
  const currentEpisodeHref = buildSignUpHref(`/episode/${episodeId}`);
  const browseHref = podcast
    ? buildSignUpHref(`/podcast/${podcast.id}`)
    : buildSignUpHref("/discover");

  return (
    <div className="space-y-8">
      <OfflineBanner isOffline={!isOnline} />
      <PublicEpisodeCTA href={currentEpisodeHref} />

      <Link
        href={browseHref}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {podcast ? `Back to ${podcast.title}` : "Back to Discover"}
      </Link>

      <div className="flex flex-col gap-6 md:flex-row">
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

        <div className="flex flex-1 flex-col gap-4">
          <div>
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
                href={buildSignUpHref(`/podcast/${podcast.id}`)}
                className="mt-1 text-lg text-muted-foreground hover:text-primary"
              >
                {podcast.title}
              </Link>
            )}
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {categories.slice(0, 4).map((category, index) => (
                <Badge key={index} variant="outline">
                  {category}
                </Badge>
              ))}
            </div>
          )}

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

          <Link href={currentEpisodeHref} className="block w-fit">
            <span className="mr-2 text-sm text-muted-foreground">
              Community Rating:
            </span>
            <CommunityRating
              episodePodcastIndexId={String(episode.id)}
              size="md"
              showCount={true}
            />
          </Link>

          {episode.enclosureUrl && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-3 text-sm font-medium">Listen to this episode</p>
                <audio
                  className="w-full"
                  controls
                  preload="none"
                  src={episode.enclosureUrl}
                />
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href={currentEpisodeHref}>Save</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href={currentEpisodeHref}>Add to Queue</Link>
            </Button>
            {safeEpisodeLink && (
              <Button variant="outline" size="lg" asChild>
                <a
                  href={safeEpisodeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Episode Page
                </a>
              </Button>
            )}
            {process.env.NEXT_PUBLIC_APP_URL && (
              <ShareButton
                title={episode.title}
                text={episode.title}
                url={`${process.env.NEXT_PUBLIC_APP_URL}/episode/${encodeURIComponent(episodeId)}`}
                summary={summaryData?.worthItReason ?? undefined}
                size="lg"
              />
            )}
          </div>
        </div>
      </div>

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

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">AI-Powered Insights</h2>
        </div>
        {summaryData?.summary ? (
          <SummaryDisplay
            summary={summaryData.summary}
            keyTakeaways={summaryData.keyTakeaways || null}
            worthItScore={summaryData.worthItScore ?? null}
            worthItReason={summaryData.worthItReason}
            worthItDimensions={summaryData.worthItDimensions}
          />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="font-medium">Summary not yet available</p>
              <p className="text-sm text-muted-foreground">
                Sign up to request one and unlock AI-powered insights for this
                episode.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
