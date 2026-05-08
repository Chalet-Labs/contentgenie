import { TopicChip } from "@/components/episodes/topic-chip";
import type { RelatedTopic } from "@/app/actions/topics";

export interface TopicRelatedListProps {
  items: RelatedTopic[];
}

export function TopicRelatedList({ items }: TopicRelatedListProps) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Related topics" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Related topics
      </h2>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <TopicChip
            key={item.id}
            canonicalTopicId={item.id}
            label={item.label}
            kind={item.kind}
          />
        ))}
      </div>
    </section>
  );
}
