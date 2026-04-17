import Link from "next/link";
import { TrendingUp, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/utils";
import { getTopicSlug } from "@/lib/trending";
import type { TrendingTopic } from "@/db/schema";

interface TrendingTopicsProps {
  topics: TrendingTopic[];
  generatedAt: Date;
}

export function TrendingTopics({ topics, generatedAt }: TrendingTopicsProps) {
  const updatedAgo = formatRelativeTime(generatedAt);
  const deduped = Array.from(new Map(topics.map((t) => [getTopicSlug(t), t])).values());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Trending Topics
        </CardTitle>
        <p className="text-sm text-muted-foreground">Past 7 days · Updated {updatedAgo}</p>
      </CardHeader>
      <CardContent className="space-y-1">
        {deduped.map((topic) => {
          const count = topic.episodeCount;
          return (
            <Link
              key={getTopicSlug(topic)}
              href={`/trending/${getTopicSlug(topic)}`}
              className="flex items-start gap-3 rounded-md p-3 transition-colors hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{topic.name}</h3>
                {topic.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{topic.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                <span>{count} {count === 1 ? "episode" : "episodes"}</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function TrendingTopicsLoading() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-56" />
      </CardHeader>
      <CardContent className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
