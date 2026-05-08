import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MIN_DERIVED_COUNT_FOR_DIGEST } from "@/lib/topic-digest-thresholds";

export interface TopicEmptyStateProps {
  label: string;
  summarizedCount: number;
  totalEpisodeCount: number;
  dormant?: boolean;
}

export function TopicEmptyState({
  label,
  summarizedCount,
  totalEpisodeCount,
  dormant = false,
}: TopicEmptyStateProps) {
  const threshold = MIN_DERIVED_COUNT_FOR_DIGEST;
  const heading = dormant
    ? "Topic dormant — synthesis paused"
    : `More coverage needed — synthesis unlocks at ${threshold} summaries`;
  const episodeWord = totalEpisodeCount === 1 ? "episode" : "episodes";
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <Sparkles
          className="h-8 w-8 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="text-lg font-semibold">{heading}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {dormant ? (
            <>
              We have summarized {summarizedCount} of {totalEpisodeCount}{" "}
              {episodeWord} for{" "}
              <span className="font-medium text-foreground">{label}</span>, but
              this topic is no longer active so synthesis is paused.
            </>
          ) : (
            <>
              We have summarized {summarizedCount} of {totalEpisodeCount}{" "}
              {episodeWord} for{" "}
              <span className="font-medium text-foreground">{label}</span>.
              Synthesis unlocks at {threshold} summaries.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
