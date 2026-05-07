import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MIN_DERIVED_COUNT_FOR_DIGEST } from "@/lib/topic-digest-thresholds";

export interface TopicEmptyStateProps {
  label: string;
  episodeCount: number;
}

export function TopicEmptyState({ label, episodeCount }: TopicEmptyStateProps) {
  const episodeWord = episodeCount === 1 ? "episode" : "episodes";
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <Sparkles
          className="h-8 w-8 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="text-lg font-semibold">
          More coverage needed — synthesize unlocks at{" "}
          {MIN_DERIVED_COUNT_FOR_DIGEST} episodes
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          We currently have {episodeCount} {episodeWord} for{" "}
          <span className="font-medium text-foreground">{label}</span>. Once
          more episodes mention this topic, an AI synthesis will appear here
          summarizing what each show says.
        </p>
      </CardContent>
    </Card>
  );
}
