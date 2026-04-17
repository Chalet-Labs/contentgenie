import Link from "next/link";
import { cn } from "@/lib/utils";
import { getTopicSlug } from "@/lib/trending";
import type { TrendingTopic } from "@/db/schema";

interface TopicSwitcherProps {
  topics: TrendingTopic[];
  activeSlug: string;
}

export function TopicSwitcher({ topics, activeSlug }: TopicSwitcherProps) {
  const deduped = Array.from(new Map(topics.map((t) => [t.name, t])).values());

  if (deduped.length === 0) return null;

  return (
    <nav className="overflow-x-auto">
      <div className="flex gap-2 whitespace-nowrap pb-2">
        {deduped.map((t) => {
          const slug = getTopicSlug(t);
          const isActive = slug === activeSlug;
          return (
            <Link
              key={t.name}
              href={`/trending/${slug}`}
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
