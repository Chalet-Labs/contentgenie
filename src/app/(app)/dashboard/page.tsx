import { Suspense } from "react";
import { currentUser } from "@clerk/nextjs/server";
import {
  getRecentEpisodesFromSubscriptions,
  getRecommendedEpisodes,
  hasAnySubscriptions,
} from "@/app/actions/dashboard";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { RecentEpisodesContainer } from "@/components/dashboard/recent-episodes-container";
import {
  EpisodeRecommendations,
  EpisodeRecommendationsLoading,
  EPISODES_INITIAL,
} from "@/components/dashboard/episode-recommendations";
import { QueueSection } from "@/components/dashboard/queue-section";
import { TrendingTopicsLoading } from "@/components/dashboard/trending-topics";
import { TrendingTopicsSection } from "@/app/(app)/dashboard/trending-topics-section";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Loading skeleton for recent episodes (inline — presentational file is "use client")
function RecentEpisodesLoading() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3].map((i) => (
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
    limit: 3,
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

// Server component for episode recommendations
async function RecommendationsSection() {
  const { episodes, error } = await getRecommendedEpisodes(EPISODES_INITIAL * 2);
  if (error) console.error("[RecommendationsSection]", error);
  return <EpisodeRecommendations episodes={episodes} />;
}

function DashboardHeader({ description }: { description: string }) {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const hasSubs = await hasAnySubscriptions();

  if (!hasSubs) {
    return (
      <div className="space-y-8">
        <DashboardHeader description="Get started by finding podcasts you love." />
        <WelcomeCard />
        <QueueSection />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header + Trending topics — compact top section */}
      <div className="space-y-4">
        <DashboardHeader description="Welcome back! Here's what's new from your subscriptions." />

        <Suspense fallback={<TrendingTopicsLoading />}>
          <TrendingTopicsSection />
        </Suspense>
      </div>

      {/* Episode recommendations — primary discovery section */}
      <Suspense fallback={<EpisodeRecommendationsLoading />}>
        <RecommendationsSection />
      </Suspense>

      {/* Queue + Recent episodes — secondary sections, side by side on lg */}
      <div className="grid gap-6 lg:grid-cols-2">
        <QueueSection />

        <Suspense fallback={<RecentEpisodesLoading />}>
          <RecentEpisodesSection />
        </Suspense>
      </div>
    </div>
  );
}
