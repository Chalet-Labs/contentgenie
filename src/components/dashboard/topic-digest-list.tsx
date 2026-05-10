import Link from "next/link";
import { Sparkles, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getRecentTopicDigests,
  type RecentTopicDigest,
} from "@/app/actions/topics";

/**
 * Pure-presentational view, exported for Storybook + RTL tests that don't
 * want to deal with the async server-component shell.
 */
export function TopicDigestListView({
  digests,
}: {
  digests: RecentTopicDigest[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          This week&apos;s takes
        </CardTitle>
        <CardDescription>
          {digests.length} digest{digests.length === 1 ? "" : "s"} · last 7 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {digests.map((d) => (
            <li key={d.canonicalId}>
              <Link
                href={`/topic/${d.canonicalId}`}
                className="flex items-start gap-3 rounded-md p-3 transition-colors hover:bg-accent"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium leading-snug">{d.label}</span>
                    <Badge variant="outline">{d.kind}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {d.episodeCount} episode{d.episodeCount === 1 ? "" : "s"}
                  </p>
                  {d.consensusPreview && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {d.consensusPreview}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center self-center">
                  <ChevronRight
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export async function TopicDigestList() {
  const result = await getRecentTopicDigests({ limit: 5 });

  if (!result.success) {
    console.error("[TopicDigestList]", result.error);
    return null;
  }

  if (result.data.length === 0) return null;

  return <TopicDigestListView digests={result.data} />;
}

export function TopicDigestListLoading() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          This week&apos;s takes
        </CardTitle>
        <CardDescription>
          <Skeleton className="h-4 w-32" />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-md p-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/4" />
              <Skeleton className="h-3 w-full" />
            </div>
            <Skeleton className="h-4 w-4 shrink-0" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
