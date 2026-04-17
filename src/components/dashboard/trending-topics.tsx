import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/utils";
import { getTopicSlug } from "@/lib/trending";
import type { TrendingTopic } from "@/db/schema";

function TopicPill({ topic }: { topic: TrendingTopic }) {
  return (
    <Link href={`/trending/${getTopicSlug(topic)}`}>
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
  const deduped = Array.from(new Map(topics.map((t) => [getTopicSlug(t), t])).values());

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          Trending · {updatedAgo}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {deduped.map((topic) => (
          <TopicPill key={getTopicSlug(topic)} topic={topic} />
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
