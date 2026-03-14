import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/utils";
import type { TrendingTopic } from "@/db/schema";

function TopicPill({ topic }: { topic: TrendingTopic }) {
  return (
    <Badge variant="secondary" className="px-3 py-1 cursor-default max-w-[200px]">
      <span className="truncate text-sm" title={topic.name}>{topic.name}</span>
      <span className="ml-1.5 text-muted-foreground font-normal shrink-0">({topic.episodeCount})</span>
    </Badge>
  );
}

interface TrendingTopicsProps {
  topics: TrendingTopic[];
  generatedAt: Date;
}

export function TrendingTopics({ topics, generatedAt }: TrendingTopicsProps) {
  const updatedAgo = formatRelativeTime(generatedAt);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg font-semibold">Trending Topics</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Past 7 days · Updated {updatedAgo}
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {topics.map((topic) => (
            <TopicPill key={topic.name} topic={topic} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function TrendingTopicsLoading() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-3 w-32 mt-1" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
