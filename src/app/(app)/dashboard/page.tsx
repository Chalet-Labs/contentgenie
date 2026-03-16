import { Suspense } from "react";
import { currentUser } from "@clerk/nextjs/server";
import {
  getRecentEpisodesFromSubscriptions,
  getRecommendedEpisodes,
  getTrendingTopics,
} from "@/app/actions/dashboard";
import { RecentEpisodesContainer } from "@/components/dashboard/recent-episodes-container";
import {
  EpisodeRecommendations,
  EpisodeRecommendationsLoading,
} from "@/components/dashboard/episode-recommendations";
import { QueueSection } from "@/components/dashboard/queue-section";
import { TrendingTopics, TrendingTopicsLoading } from "@/components/dashboard/trending-topics";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Loading skeleton for recent episodes (inline — presentational file is "use client")
function RecentEpisodesLoading() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-14 w-14 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Server component for recent episodes
async function RecentEpisodesSection() {
  const user = await currentUser();
  const lastSignInAt = user?.lastSignInAt ? new Date(user.lastSignInAt) : null;

  // Treat as null if within 5 minutes (current session is first session)
  const sinceLastLogin =
    lastSignInAt === null ||
    Date.now() - lastSignInAt.getTime() < 5 * 60 * 1000
      ? null
      : Math.floor(lastSignInAt.getTime() / 1000);

  const { episodes, hasSubscriptions, error } = await getRecentEpisodesFromSubscriptions({
    limit: 5,
    since: Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000),
  });

  if (error) console.error("[RecentEpisodesSection]", error);

  return (
    <RecentEpisodesContainer
      initialEpisodes={episodes}
      sinceLastLogin={sinceLastLogin}
      hasSubscriptions={hasSubscriptions}
    />
  );
}

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

// Server component for trending topics
async function TrendingTopicsSection() {
  const { topics, error } = await getTrendingTopics();
  if (error) console.error("[TrendingTopicsSection]", error);
  if (!topics || topics.items.length === 0) return null;
  const isStale = Date.now() - topics.generatedAt.getTime() > STALE_THRESHOLD_MS;
  if (isStale) return null;
  return <TrendingTopics topics={topics.items} generatedAt={topics.generatedAt} />;
}

// Server component for episode recommendations
async function RecommendationsSection() {
  const { episodes, error } = await getRecommendedEpisodes(6);
  if (error) console.error("[RecommendationsSection]", error);
  return <EpisodeRecommendations episodes={episodes} />;
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here&apos;s what&apos;s new from your subscriptions.
        </p>
      </div>

      {/* Trending topics */}
      <Suspense fallback={<TrendingTopicsLoading />}>
        <TrendingTopicsSection />
      </Suspense>

      {/* Episode recommendations */}
      <Suspense fallback={<EpisodeRecommendationsLoading />}>
        <RecommendationsSection />
      </Suspense>

      {/* Queue section */}
      <QueueSection />

      {/* Recent episodes from subscriptions */}
      <Suspense fallback={<RecentEpisodesLoading />}>
        <RecentEpisodesSection />
      </Suspense>
    </div>
  );
}
