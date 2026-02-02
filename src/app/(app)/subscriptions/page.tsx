export default function SubscriptionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-muted-foreground">
          Manage your podcast subscriptions.
        </p>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          You haven&apos;t subscribed to any podcasts yet. Head to Discover to find some!
        </p>
      </div>
    </div>
  )
}
