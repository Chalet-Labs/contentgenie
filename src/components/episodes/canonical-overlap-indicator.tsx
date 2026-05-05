import { cn } from "@/lib/utils";
import type { CanonicalOverlapResult } from "@/lib/topic-overlap";

export interface CanonicalOverlapIndicatorProps {
  overlap: CanonicalOverlapResult;
  className?: string;
}

export function CanonicalOverlapIndicator({
  overlap,
  className,
}: CanonicalOverlapIndicatorProps) {
  const copy =
    overlap.kind === "repeat"
      ? `You've heard ${overlap.count} episodes on ${overlap.topicLabel}`
      : `New: ${overlap.topicLabel}`;

  return (
    <p
      data-testid="overlap-indicator"
      data-canonical-overlap-kind={overlap.kind}
      className={cn(
        "text-xs font-medium",
        overlap.kind === "repeat"
          ? "text-status-warning-text"
          : "text-status-success-text",
        className,
      )}
    >
      {copy}
    </p>
  );
}
