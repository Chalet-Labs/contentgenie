import { cn } from "@/lib/utils";
import { getScoreColor, getScoreLabel } from "@/lib/score-utils";
import { Badge } from "@/components/ui/badge";

interface WorthItBadgeProps {
  score: number | null;
}

export function WorthItBadge({ score }: WorthItBadgeProps) {
  if (score === null) return null;

  return (
    <Badge
      className={cn(
        "rounded-full px-3 py-1 text-sm text-white",
        getScoreColor(score)
      )}
    >
      {score.toFixed(1)} &middot; {getScoreLabel(score)}
    </Badge>
  );
}
