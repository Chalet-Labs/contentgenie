import { cn } from "@/lib/utils";
import { getScoreColor, getScoreLabel } from "@/lib/score-utils";
import { Badge } from "@/components/ui/badge";

interface WorthItBadgeProps {
  score: number | null;
}

export function WorthItBadge({ score }: WorthItBadgeProps) {
  if (score === null) {
    return (
      <Badge variant="secondary" className="px-3 py-1 text-sm">
        Not rated
      </Badge>
    );
  }

  return (
    <Badge
      variant="score"
      className={cn("px-3 py-1 text-sm", getScoreColor(score))}
    >
      {score.toFixed(1)} &middot; {getScoreLabel(score)}
    </Badge>
  );
}
