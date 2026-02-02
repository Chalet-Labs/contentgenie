import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Rss, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EpisodeList } from "@/components/podcasts/episode-list";
import {
  getPodcastById,
  getEpisodesByFeedId,
  formatPublishDate,
} from "@/lib/podcastindex";

interface PodcastPageProps {
  params: {
    id: string;
  };
}

export default async function PodcastPage({ params }: PodcastPageProps) {
  const feedId = parseInt(params.id, 10);

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

    if (!podcast) {
      notFound();
    }

    const categories = podcast.categories
      ? Object.values(podcast.categories)
      : [];

    return (
      <div className="space-y-8">
        {/* Back navigation */}
        <Link
          href="/discover"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Discover
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
              <Button size="lg">
                <Rss className="mr-2 h-4 w-4" />
                Subscribe
              </Button>
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
          <EpisodeList episodes={episodes} />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error fetching podcast:", error);
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
            Failed to load podcast details. Please try again later.
          </p>
        </div>
      </div>
    );
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
