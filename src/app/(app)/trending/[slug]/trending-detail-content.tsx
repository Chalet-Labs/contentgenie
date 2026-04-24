import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Rss } from "lucide-react";
import { getTrendingTopicBySlug } from "@/app/actions/dashboard";
import { getListenedEpisodeIds } from "@/app/actions/listen-history";
import { TopicSwitcher } from "@/components/trending/topic-switcher";
import { WorthItBadge } from "@/components/episodes/worth-it-badge";
import { ListenedButton } from "@/components/episodes/listened-button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatDate,
  formatDuration,
  formatRelativeTime,
  stripHtml,
} from "@/lib/utils";
import { isTrendingSnapshotStale } from "@/lib/trending";
import type { RecommendedEpisodeDTO } from "@/db/library-columns";

function FallbackCard({
  heading,
  body,
  children,
}: {
  heading: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{heading}</h1>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">{body}</p>
          {children}
          <Link
            href="/dashboard"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function EpisodeCard({
  episode,
  isListened = false,
}: {
  episode: RecommendedEpisodeDTO;
  isListened?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent">
      <Link
        href={`/episode/${episode.podcastIndexId}`}
        aria-label={`${episode.title} from ${episode.podcastTitle}`}
        className="flex min-w-0 flex-1 gap-3"
      >
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
          {episode.podcastImageUrl ? (
            <Image
              src={episode.podcastImageUrl}
              alt=""
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
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {episode.podcastTitle}
          </p>
          {episode.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {stripHtml(episode.description)}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <WorthItBadge
              score={
                episode.worthItScore != null
                  ? Number(episode.worthItScore)
                  : null
              }
            />
            <span className="text-xs text-muted-foreground">
              {[
                formatDuration(episode.duration),
                episode.publishDate ? formatDate(episode.publishDate) : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        </div>
      </Link>
      <ListenedButton
        podcastIndexEpisodeId={episode.podcastIndexId}
        isListened={isListened}
      />
    </div>
  );
}

export async function TrendingDetailContent({ slug }: { slug: string }) {
  const result = await getTrendingTopicBySlug(slug);

  switch (result.kind) {
    case "error":
      // Action already logs the underlying error with full context.
      return (
        <FallbackCard
          heading="Trending topics unavailable"
          body="We couldn't load trending topics right now. Refresh the page or try again in a moment."
        />
      );

    case "no-snapshot":
      return (
        <FallbackCard
          heading="No trending topics right now"
          body="Check back soon — new trending topics are generated daily."
        />
      );

    case "unknown-slug": {
      const staleNotice = isTrendingSnapshotStale(result.generatedAt)
        ? " These trending topics may be out of date."
        : "";
      return (
        <FallbackCard
          heading="This topic is no longer trending"
          body={`This topic didn't make the latest trending snapshot. Browse other topics below.${staleNotice}`}
        >
          <TopicSwitcher topics={result.allTopics} activeSlug={slug} />
        </FallbackCard>
      );
    }

    case "found": {
      const { topic, allTopics, episodes, generatedAt } = result;
      const listenedIds =
        episodes.length > 0
          ? await getListenedEpisodeIds(episodes.map((e) => e.id))
          : [];
      const listenedSet = new Set<number>(listenedIds);
      return (
        <div className="space-y-6">
          <h1 className="text-3xl font-bold tracking-tight">{topic.name}</h1>

          <TopicSwitcher topics={allTopics} activeSlug={slug} />

          <div>
            <p className="mb-1 text-sm text-muted-foreground">
              {topic.description}
            </p>
            <p className="text-sm text-muted-foreground">
              Past 7 days &middot; Updated {formatRelativeTime(generatedAt)}
            </p>
            {isTrendingSnapshotStale(generatedAt) && (
              <p className="text-sm text-muted-foreground">
                This trending topic may be out of date.
              </p>
            )}
          </div>

          {episodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No episodes available for this topic yet.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {episodes.map((episode) => (
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  isListened={listenedSet.has(episode.id)}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    default: {
      // Exhaustiveness guard: if TrendingTopicDetailResult gains a new kind,
      // TypeScript will reject this assignment so the case gets handled.
      // Throw rather than return so any bypass of type-checking fails loudly
      // at runtime instead of rendering nothing.
      const _exhaustive: never = result;
      throw new Error(
        `Unhandled TrendingTopicDetailResult kind: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}
