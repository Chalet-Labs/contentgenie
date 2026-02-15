import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc as descOrder, inArray } from "drizzle-orm";
import { ArrowLeft, Rss, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { stripHtml } from "@/lib/utils";
import { EpisodeList } from "@/components/podcasts/episode-list";
import { SubscribeButton } from "@/components/podcasts/subscribe-button";
import { BatchSummarizeButton } from "@/components/podcasts/batch-summarize-button";
import { ShareButton } from "@/components/ui/share-button";
import {
  getPodcastById,
  getEpisodesByFeedId,
  formatPublishDate,
} from "@/lib/podcastindex";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import { isSubscribedToPodcast } from "@/app/actions/subscriptions";
import { db } from "@/db";
import { podcasts, episodes as episodesTable } from "@/db/schema";
import type { SummaryStatus } from "@/db/schema";
import { getBackNavigation } from "@/app/(app)/podcast/[id]/back-navigation";

interface PodcastPageProps {
  params: {
    id: string;
  };
  searchParams: { [key: string]: string | string[] | undefined };
}

function isRssSourced(id: string): boolean {
  return id.startsWith("rss-");
}

function buildSummaryMaps(
  episodes: { podcastIndexId: string; summaryStatus: SummaryStatus | null; worthItScore: string | null }[],
) {
  const statusMap: Record<string, SummaryStatus> = {};
  const scoreMap: Record<string, string> = {};
  for (const ep of episodes) {
    if (ep.summaryStatus) statusMap[ep.podcastIndexId] = ep.summaryStatus;
    if (ep.worthItScore !== null) scoreMap[ep.podcastIndexId] = ep.worthItScore;
  }
  return { statusMap, scoreMap };
}

async function loadRssPodcast(podcastIndexId: string) {
  const podcast = await db.query.podcasts.findFirst({
    where: eq(podcasts.podcastIndexId, podcastIndexId),
  });

  if (!podcast) return null;

  // BOLT OPTIMIZATION: Use selective column fetching to avoid loading high-volume text fields
  // (like transcription and summary) for the episode list.
  // Expected impact: Reduces database data transfer by ~90% when transcripts are present.
  const dbEpisodes = await db.query.episodes.findMany({
    where: eq(episodesTable.podcastId, podcast.id),
    orderBy: [descOrder(episodesTable.publishDate)],
    limit: 50,
    // id omitted: RSS mapping uses podcastIndexId
    columns: {
      podcastIndexId: true,
      title: true,
      description: true,
      rssGuid: true,
      publishDate: true,
      audioUrl: true,
      duration: true,
      summaryStatus: true,
      worthItScore: true,
    },
  });

  const { statusMap, scoreMap } = buildSummaryMaps(dbEpisodes);

  // Map DB episodes to PodcastIndexEpisode shape for reuse of EpisodeList
  // Use podcastIndexId (rss-...) as the id so EpisodeCard links to /episode/rss-...
  // which the episode API route handles correctly.
  const mappedEpisodes: PodcastIndexEpisode[] = dbEpisodes.map((ep) => ({
    id: ep.podcastIndexId,
    title: ep.title,
    link: "",
    description: ep.description ?? "",
    guid: ep.rssGuid ?? ep.podcastIndexId,
    datePublished: ep.publishDate
      ? Math.floor(ep.publishDate.getTime() / 1000)
      : 0,
    datePublishedPretty: ep.publishDate
      ? ep.publishDate.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "",
    dateCrawled: 0,
    enclosureUrl: ep.audioUrl ?? "",
    enclosureType: "audio/mpeg",
    enclosureLength: 0,
    duration: ep.duration ?? 0,
    explicit: 0,
    episode: null,
    episodeType: "full",
    season: 0,
    image: "",
    feedItunesId: null,
    feedImage: podcast.imageUrl ?? "",
    feedId: podcast.id,
    feedLanguage: "",
    feedDead: 0,
    feedDuplicateOf: null,
    chaptersUrl: null,
    transcriptUrl: null,
    soundbite: null,
    soundbites: [],
    transcripts: [],
  }));

  return { podcast, episodes: mappedEpisodes, statusMap, scoreMap };
}

export default async function PodcastPage({ params, searchParams }: PodcastPageProps) {
  const from = typeof searchParams.from === "string" ? searchParams.from : undefined;
  const backNav = getBackNavigation(from);
  const id = params.id;

  if (isRssSourced(id)) {
    // Load RSS-sourced podcast from database
    const data = await loadRssPodcast(id);

    if (!data) {
      notFound();
    }

    const { podcast, episodes, statusMap, scoreMap } = data;
    const subscribed = await isSubscribedToPodcast(podcast.podcastIndexId);
    const categories = (podcast.categories as string[]) ?? [];

    return (
      <div className="space-y-8">
        <Link
          href={backNav.href}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {backNav.label}
        </Link>

        <div className="flex flex-col gap-6 md:flex-row">
          <div className="relative h-48 w-48 shrink-0 overflow-hidden rounded-xl bg-muted shadow-lg">
            {podcast.imageUrl ? (
              <Image
                src={podcast.imageUrl}
                alt={podcast.title}
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

          <div className="flex flex-1 flex-col gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {podcast.title}
              </h1>
              <p className="mt-1 text-lg text-muted-foreground">
                {podcast.publisher ?? "Unknown author"}
              </p>
            </div>

            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {categories.map((category, index) => (
                  <Badge key={index} variant="secondary">
                    {category}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>{episodes.length} episodes</span>
              <Badge variant="outline">RSS Import</Badge>
            </div>

            <div className="flex flex-wrap gap-3">
              <SubscribeButton
                podcastIndexId={podcast.podcastIndexId}
                title={podcast.title}
                description={podcast.description ?? undefined}
                publisher={podcast.publisher ?? undefined}
                imageUrl={podcast.imageUrl ?? undefined}
                rssFeedUrl={podcast.rssFeedUrl ?? undefined}
                categories={categories}
                initialSubscribed={subscribed}
              />
              {podcast.rssFeedUrl && (
                <Button variant="outline" size="lg" asChild>
                  <a
                    href={podcast.rssFeedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Rss className="mr-2 h-4 w-4" />
                    RSS Feed
                  </a>
                </Button>
              )}
              <BatchSummarizeButton
                episodeIds={episodes.map((e) => e.id)}
              />
              {process.env.NEXT_PUBLIC_APP_URL && (
                <ShareButton
                  title={podcast.title}
                  text="Check out this podcast on ContentGenie"
                  url={`${process.env.NEXT_PUBLIC_APP_URL}/podcast/${podcast.podcastIndexId}`}
                />
              )}
            </div>
          </div>
        </div>

        {podcast.description && (
          <div className="rounded-lg border bg-card p-6">
            <h2 className="mb-3 text-lg font-semibold">About</h2>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {stripHtml(podcast.description)}
            </p>
          </div>
        )}

        <div>
          <h2 className="mb-4 text-xl font-semibold">
            Episodes ({episodes.length})
          </h2>
          <EpisodeList episodes={episodes} statusMap={statusMap} scoreMap={scoreMap} />
        </div>
      </div>
    );
  }

  // PodcastIndex-sourced podcast (existing behavior)
  const feedId = parseInt(id, 10);

  if (isNaN(feedId)) {
    notFound();
  }

  try {
    const [podcastResponse, episodesResponse] = await Promise.all([
      getPodcastById(feedId),
      getEpisodesByFeedId(feedId, 20),
    ]);

    const podcast = podcastResponse.feed;
    const episodes = episodesResponse.items || [];

    // Batch-query DB for summary data
    const episodeStringIds = episodes.map((e) => String(e.id));
    const dbEpisodeData = episodeStringIds.length > 0
      ? await db.query.episodes.findMany({
          where: inArray(episodesTable.podcastIndexId, episodeStringIds),
          columns: { podcastIndexId: true, summaryStatus: true, worthItScore: true },
        })
      : [];
    const { statusMap, scoreMap } = buildSummaryMaps(dbEpisodeData);

    if (!podcast) {
      notFound();
    }

    // Check subscription status
    const subscribed = await isSubscribedToPodcast(podcast.id.toString());

    const categories = podcast.categories
      ? Object.values(podcast.categories)
      : [];

    return (
      <div className="space-y-8">
        {/* Back navigation */}
        <Link
          href={backNav.href}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {backNav.label}
        </Link>

        {/* Podcast header */}
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Podcast artwork */}
          <div className="relative h-48 w-48 shrink-0 overflow-hidden rounded-xl bg-muted shadow-lg">
            {podcast.artwork || podcast.image ? (
              <Image
                src={podcast.artwork || podcast.image}
                alt={podcast.title}
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

          {/* Podcast info */}
          <div className="flex flex-1 flex-col gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {podcast.title}
              </h1>
              <p className="mt-1 text-lg text-muted-foreground">
                {podcast.author || podcast.ownerName || "Unknown author"}
              </p>
            </div>

            {/* Categories */}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {categories.map((category, index) => (
                  <Badge key={index} variant="secondary">
                    {category}
                  </Badge>
                ))}
              </div>
            )}

            {/* Stats */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {podcast.episodeCount > 0 && (
                <span>{podcast.episodeCount} episodes</span>
              )}
              {podcast.newestItemPubdate > 0 && (
                <span>
                  Latest: {formatPublishDate(podcast.newestItemPubdate)}
                </span>
              )}
              {podcast.language && (
                <span className="uppercase">{podcast.language}</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <SubscribeButton
                podcastIndexId={podcast.id.toString()}
                title={podcast.title}
                description={podcast.description}
                publisher={podcast.author || podcast.ownerName}
                imageUrl={podcast.artwork || podcast.image}
                rssFeedUrl={podcast.url}
                categories={categories}
                totalEpisodes={podcast.episodeCount}
                latestEpisodeDate={podcast.newestItemPubdate}
                initialSubscribed={subscribed}
              />
              {podcast.link && (
                <Button variant="outline" size="lg" asChild>
                  <a
                    href={podcast.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Website
                  </a>
                </Button>
              )}
              <BatchSummarizeButton
                episodeIds={episodes.map((e) => e.id)}
              />
              {process.env.NEXT_PUBLIC_APP_URL && (
                <ShareButton
                  title={podcast.title}
                  text="Check out this podcast on ContentGenie"
                  url={`${process.env.NEXT_PUBLIC_APP_URL}/podcast/${podcast.id}`}
                />
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {podcast.description && (
          <div className="rounded-lg border bg-card p-6">
            <h2 className="mb-3 text-lg font-semibold">About</h2>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {stripHtml(podcast.description)}
            </p>
          </div>
        )}

        {/* Episodes */}
        <div>
          <h2 className="mb-4 text-xl font-semibold">
            Episodes ({episodes.length})
          </h2>
          <EpisodeList episodes={episodes} statusMap={statusMap} scoreMap={scoreMap} />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error fetching podcast:", error);
    return (
      <div className="space-y-4">
        <Link
          href={backNav.href}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {backNav.label}
        </Link>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">
            Failed to load podcast details. Please try again later.
          </p>
        </div>
      </div>
    );
  }
}

