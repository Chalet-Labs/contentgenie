import Link from "next/link";
import { cn, slugify } from "@/lib/utils";
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
          // Mirrors the fallback in getTrendingTopicBySlug: legacy JSON rows may
          // lack a slug key even though the TS type claims it is required.
          const slug = t.slug ?? slugify(t.name);
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
