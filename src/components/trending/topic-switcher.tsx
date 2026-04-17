import Link from "next/link";
import { cn } from "@/lib/utils";
import { getTopicSlug } from "@/lib/trending";
import type { TrendingTopic } from "@/db/schema";

interface TopicSwitcherProps {
  topics: TrendingTopic[];
  activeSlug: string;
}

export function TopicSwitcher({ topics, activeSlug }: TopicSwitcherProps) {
  // Dedupe by resolved slug so two topics sharing a display name but distinct
  // slugs both remain reachable from the switcher.
  const deduped = Array.from(new Map(topics.map((t) => [getTopicSlug(t), t])).values());

  if (deduped.length === 0) return null;

  return (
    <nav aria-label="Trending topics" className="overflow-x-auto">
      <div className="flex gap-2 whitespace-nowrap pb-2">
        {deduped.map((t) => {
          const slug = getTopicSlug(t);
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
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {t.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
