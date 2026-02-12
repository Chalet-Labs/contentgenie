import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscoverContent } from "./discover-content";

function DiscoverPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-24" />
      </div>
      <Skeleton className="h-4 w-48 mx-auto" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Discover</h1>
        <p className="text-muted-foreground">
          Search and explore podcasts to find your next favorite show.
        </p>
      </div>

      <Suspense fallback={<DiscoverPageSkeleton />}>
        <DiscoverContent />
      </Suspense>
    </div>
  );
}
