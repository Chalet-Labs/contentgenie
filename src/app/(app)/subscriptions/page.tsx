import Link from "next/link";
import { Rss, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubscriptionCard } from "@/components/podcasts/subscription-card";
import { getUserSubscriptions } from "@/app/actions/subscriptions";

export default async function SubscriptionsPage() {
  const { subscriptions, error } = await getUserSubscriptions();

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground">
            Manage your podcast subscriptions.
          </p>
        </div>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground">
            {subscriptions.length > 0
              ? `You're subscribed to ${subscriptions.length} podcast${subscriptions.length === 1 ? "" : "s"}.`
              : "Manage your podcast subscriptions."}
          </p>
        </div>
        <Button asChild>
          <Link href="/discover">
            <Search className="mr-2 h-4 w-4" />
            Discover
          </Link>
        </Button>
      </div>

      {subscriptions.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Rss className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">No subscriptions yet</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Subscribe to podcasts to keep track of new episodes and get
            personalized recommendations.
          </p>
          <Button asChild>
            <Link href="/discover">
              <Search className="mr-2 h-4 w-4" />
              Find Podcasts
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {subscriptions.map((subscription) => (
            <SubscriptionCard
              key={subscription.id}
              podcast={subscription.podcast}
              subscribedAt={subscription.subscribedAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
