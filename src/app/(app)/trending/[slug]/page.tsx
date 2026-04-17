import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingDetailContent } from "./trending-detail-content";

interface TrendingDetailPageProps {
  params: {
    slug: string;
  };
}

function TrendingDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-64" />
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

export default async function TrendingDetailPage({ params }: TrendingDetailPageProps) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<TrendingDetailLoading />}>
        <TrendingDetailContent slug={params.slug} />
      </Suspense>
    </div>
  );
}
