import { Suspense } from "react";
import {
  getRecentEpisodesFromSubscriptions,
  getRecentlySavedItems,
  getRecommendedPodcasts,
} from "@/app/actions/dashboard";
import { RecentEpisodes } from "@/components/dashboard/recent-episodes";
import { SavedItems } from "@/components/dashboard/saved-items";
import { Recommendations } from "@/components/dashboard/recommendations";
import { QueueSection } from "@/components/dashboard/queue-section";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Loading skeleton for card sections
function CardLoading() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
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
  const { episodes, error } = await getRecentEpisodesFromSubscriptions(5);
  if (error && episodes.length === 0) {
    return <RecentEpisodes episodes={[]} />;
  }
  return <RecentEpisodes episodes={episodes} />;
}

// Server component for saved items
async function SavedItemsSection() {
  const { items, error } = await getRecentlySavedItems(5);
  if (error && items.length === 0) {
    return <SavedItems items={[]} />;
  }
  return <SavedItems items={items} />;
}

// Server component for recommendations
async function RecommendationsSection() {
  const { podcasts, error } = await getRecommendedPodcasts(6);
  if (error && podcasts.length === 0) {
    return <Recommendations podcasts={[]} />;
  }
  return <Recommendations podcasts={podcasts} />;
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

      {/* Queue section */}
      <QueueSection />

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent episodes from subscriptions */}
        <Suspense fallback={<CardLoading />}>
          <RecentEpisodesSection />
        </Suspense>

        {/* Recently saved items */}
        <Suspense fallback={<CardLoading />}>
          <SavedItemsSection />
        </Suspense>
      </div>

      {/* Recommendations section */}
      <Suspense fallback={<CardLoading />}>
        <RecommendationsSection />
      </Suspense>
    </div>
  );
}
