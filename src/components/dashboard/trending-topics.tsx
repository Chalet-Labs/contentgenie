import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/utils";
import type { TrendingTopic } from "@/db/schema";

function TopicPill({ topic }: { topic: TrendingTopic }) {
  return (
    <Link href={`/discover?q=${encodeURIComponent(topic.name)}`}>
      <Badge variant="secondary" className="px-3 py-1 max-w-[200px] hover:bg-secondary/80 transition-colors">
        <span className="min-w-0 flex-1 truncate text-sm" title={topic.name}>{topic.name}</span>
        <span className="ml-1.5 text-muted-foreground font-normal shrink-0">({topic.episodeCount})</span>
      </Badge>
    </Link>
  );
}

interface TrendingTopicsProps {
  topics: TrendingTopic[];
  generatedAt: Date;
}

export function TrendingTopics({ topics, generatedAt }: TrendingTopicsProps) {
  const updatedAgo = formatRelativeTime(generatedAt);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          Trending · {updatedAgo}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {topics.map((topic) => (
          <TopicPill key={topic.name} topic={topic} />
        ))}
      </div>
    </div>
  );
}

export function TrendingTopicsLoading() {
  return (
    <div>
      <Skeleton className="mb-3 h-4 w-32" />
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
    </div>
  );
}
