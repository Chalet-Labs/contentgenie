import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MIN_DERIVED_COUNT_FOR_DIGEST } from "@/lib/topic-digest-thresholds";

export interface TopicEmptyStateProps {
  label: string;
  summarizedCount: number;
  totalEpisodeCount: number;
}

export function TopicEmptyState({
  label,
  summarizedCount,
  totalEpisodeCount,
}: TopicEmptyStateProps) {
  const threshold = MIN_DERIVED_COUNT_FOR_DIGEST;
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <Sparkles
          className="h-8 w-8 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="text-lg font-semibold">
          More coverage needed — synthesis unlocks at {threshold} summaries
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          We have summarized {summarizedCount} of {totalEpisodeCount}{" "}
          {totalEpisodeCount === 1 ? "episode" : "episodes"} for{" "}
          <span className="font-medium text-foreground">{label}</span>.
          Synthesis unlocks at {threshold} summaries.
        </p>
      </CardContent>
    </Card>
  );
}
