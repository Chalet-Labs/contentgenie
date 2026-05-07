import { cn } from "@/lib/utils";
import type {
  CanonicalOverlapResult,
  OverlapLabelKind,
} from "@/lib/topic-overlap";
import { CanonicalOverlapIndicator } from "@/components/episodes/canonical-overlap-indicator";

export interface OverlapIndicatorProps {
  canonical?: CanonicalOverlapResult | null;
  categoryLabel?: string | null;
  categoryLabelKind?: OverlapLabelKind | null;
  className?: string;
}

export function OverlapIndicator({
  canonical,
  categoryLabel,
  categoryLabelKind,
  className,
}: OverlapIndicatorProps) {
  if (canonical) {
    return (
      <CanonicalOverlapIndicator overlap={canonical} className={className} />
    );
  }
  if (!categoryLabel) return null;
  return (
    <p
      data-testid="overlap-indicator"
      className={cn(
        "text-xs font-medium",
        categoryLabelKind === "high-overlap"
          ? "text-status-warning-text"
          : "text-status-success-text",
        className,
      )}
    >
      {categoryLabel}
    </p>
  );
}
