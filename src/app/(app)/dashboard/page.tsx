export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here&apos;s what&apos;s new from your subscriptions.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-semibold">Recent Episodes</h3>
          <p className="text-sm text-muted-foreground mt-2">
            No recent episodes yet. Subscribe to some podcasts to get started.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-semibold">Saved Items</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Your library is empty. Save episodes to find them here.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-semibold">Recommendations</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Discover podcasts to get personalized recommendations.
          </p>
        </div>
      </div>
    </div>
  )
}
