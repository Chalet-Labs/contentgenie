import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Rss } from "lucide-react";
import { getTrendingTopicBySlug } from "@/app/actions/dashboard";
import { TopicSwitcher } from "@/components/trending/topic-switcher";
import { WorthItBadge } from "@/components/episodes/worth-it-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatDuration, formatRelativeTime, stripHtml } from "@/lib/utils";
import { isTrendingSnapshotStale } from "@/lib/trending";
import type { RecommendedEpisodeDTO } from "@/db/library-columns";

function FallbackCard({ heading, body, children }: { heading: string; body: string; children?: ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{heading}</h1>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">{body}</p>
          {children}
          <Link href="/dashboard" className="text-sm text-primary underline-offset-4 hover:underline">
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function EpisodeCard({ episode }: { episode: RecommendedEpisodeDTO }) {
  return (
    <Link
      href={`/episode/${episode.podcastIndexId}`}
      aria-label={`${episode.title} from ${episode.podcastTitle}`}
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

export async function TrendingDetailContent({ slug }: { slug: string }) {
  const { topic, allTopics, episodes, generatedAt, error } = await getTrendingTopicBySlug(slug);

  if (error) {
    // Action already logs the underlying error with full context; no duplicate log here.
    return (
      <FallbackCard
        heading="Trending topics unavailable"
        body="We couldn't load trending topics right now. Refresh the page or try again in a moment."
      />
    );
  }

  if (!topic) {
    // Two empty states: no snapshot at all (allTopics empty) vs. a current
    // snapshot that just doesn't include this slug (topic fell out of the run).
    const isEmpty = allTopics.length === 0;
    return (
      <FallbackCard
        heading={isEmpty ? "No trending topics right now" : "This topic is no longer trending"}
        body={
          isEmpty
            ? "Check back soon — new trending topics are generated daily."
            : "This topic didn't make the latest trending snapshot. Browse other topics below."
        }
      >
        <TopicSwitcher topics={allTopics} activeSlug={slug} />
      </FallbackCard>
    );
  }

  // Invariant: when topic is non-null, the action returns it with the same
  // snapshot row's generatedAt, so generatedAt is guaranteed non-null here.
  const snapshotTime = generatedAt as Date;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{topic.name}</h1>

      {isTrendingSnapshotStale(snapshotTime) && (
        <p className="text-sm text-muted-foreground">
          These trending topics may be out of date.
        </p>
      )}

      <TopicSwitcher topics={allTopics} activeSlug={slug} />

      <div>
        <p className="mb-1 text-sm text-muted-foreground">{topic.description}</p>
        <p className="text-sm text-muted-foreground">
          Past 7 days &middot; Updated {formatRelativeTime(snapshotTime)}
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
