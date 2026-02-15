import { cn } from "@/lib/utils";
import { getScoreColor, getScoreLabel } from "@/lib/score-utils";

interface WorthItBadgeProps {
  score: number | null;
}

export function WorthItBadge({ score }: WorthItBadgeProps) {
  if (score === null) return null;

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm",
          getScoreColor(score)
        )}
      >
        <span className="text-sm font-bold">{score.toFixed(1)}</span>
      </div>
      <span className="text-sm font-medium text-muted-foreground">
        {getScoreLabel(score)}
      </span>
    </div>
  );
}
