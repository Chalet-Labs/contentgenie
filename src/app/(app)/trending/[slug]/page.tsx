import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { Rss } from "lucide-react";
import { getTrendingTopicBySlug } from "@/app/actions/dashboard";
import { TopicSwitcher } from "@/components/trending/topic-switcher";
import { WorthItBadge } from "@/components/episodes/worth-it-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDuration, formatRelativeTime, stripHtml } from "@/lib/utils";
import type { RecommendedEpisodeDTO } from "@/db/library-columns";

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

function TrendingDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex gap-3 p-2">
            <Skeleton className="h-14 w-14 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EpisodeCard({ episode }: { episode: RecommendedEpisodeDTO }) {
  return (
    <Link
      href={`/episode/${episode.podcastIndexId}`}
      className="flex gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {episode.podcastImageUrl ? (
          <Image
            src={episode.podcastImageUrl}
            alt={episode.podcastTitle}
            fill
            className="object-cover"
            sizes="56px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Rss className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="line-clamp-1 text-sm font-medium">{episode.title}</h4>
        <p className="line-clamp-1 text-xs text-muted-foreground">{episode.podcastTitle}</p>
        {episode.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {stripHtml(episode.description)}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <WorthItBadge score={episode.worthItScore != null ? Number(episode.worthItScore) : null} />
          <span className="text-xs text-muted-foreground">
            {formatDuration(episode.duration)}
            {episode.publishDate && <> &middot; {formatDate(episode.publishDate)}</>}
          </span>
        </div>
      </div>
    </Link>
  );
}

async function TrendingDetailContent({ slug }: { slug: string }) {
  const { topic, allTopics, episodes, generatedAt, error } = await getTrendingTopicBySlug(slug);

  if (error) {
    console.error("[TrendingDetailContent]", error);
  }

  // No snapshot or unknown slug
  if (!topic) {
    const heading = allTopics.length === 0 ? "No trending topics right now" : "This topic is no longer trending";
    const body =
      allTopics.length === 0
        ? "Check back soon — new trending topics are generated daily."
        : "This topic didn't make the latest trending snapshot. Browse other topics below.";

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{heading}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{body}</p>
            <TopicSwitcher topics={allTopics} activeSlug={slug} />
            <Link href="/dashboard" className="text-sm text-primary underline-offset-4 hover:underline">
              Back to dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isStale = generatedAt != null && Date.now() - generatedAt.getTime() > STALE_THRESHOLD_MS;

  return (
    <div className="space-y-6">
      {isStale && (
        <p className="text-sm text-muted-foreground">
          These trending topics may be out of date.
        </p>
      )}

      <TopicSwitcher topics={allTopics} activeSlug={slug} />

      <div>
        <p className="mb-1 text-sm text-muted-foreground">{topic.description}</p>
        <p className="text-sm text-muted-foreground">
          Past 7 days &middot; Updated {generatedAt ? formatRelativeTime(generatedAt) : "unknown"}
        </p>
      </div>

      {episodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No episodes available for this topic yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {episodes.map((episode) => (
            <EpisodeCard key={episode.id} episode={episode} />
          ))}
        </div>
      )}
    </div>
  );
}

export default async function TrendingDetailPage({ params }: { params: { slug: string } }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight capitalize">
          {params.slug.replace(/-/g, " ")}
        </h1>
      </div>
      <Suspense fallback={<TrendingDetailLoading />}>
        <TrendingDetailContent slug={params.slug} />
      </Suspense>
    </div>
  );
}
