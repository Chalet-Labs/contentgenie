import Link from "next/link";
import { cn } from "@/lib/utils";
import { dedupeTopics } from "@/lib/trending";
import type { TrendingTopic } from "@/db/schema";

interface TopicSwitcherProps {
  topics: TrendingTopic[];
  activeSlug: string;
}

export function TopicSwitcher({ topics, activeSlug }: TopicSwitcherProps) {
  const deduped = dedupeTopics(topics);

  if (deduped.length === 0) return null;

  return (
    <nav aria-label="Trending topics" className="overflow-x-auto">
      <div className="flex gap-2 whitespace-nowrap pb-2">
        {deduped.map(({ topic, slug }) => {
          const isActive = slug === activeSlug;
          return (
            <Link
              key={slug}
              href={`/trending/${slug}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {topic.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
