"use client";

import { useState, useTransition } from "react";
import { Star, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RatingInputProps {
  initialRating: number | null;
  onRatingChange: (rating: number) => Promise<{ success: boolean; error?: string }>;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  disabled?: boolean;
}

export function RatingInput({
  initialRating,
  onRatingChange,
  size = "md",
  showLabel = true,
  disabled = false,
}: RatingInputProps) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const handleClick = (value: number) => {
    if (disabled || isPending) return;

    // Allow toggling off the rating by clicking the same star
    const newRating = rating === value ? null : value;

    setError(null);
    startTransition(async () => {
      // Only submit if there's a rating to save
      if (newRating !== null) {
        const result = await onRatingChange(newRating);
        if (result.success) {
          setRating(newRating);
        } else {
          setError(result.error || "Failed to save rating");
        }
      } else {
        // For removing rating, we'd need a separate action
        // For now, just update the UI
        setRating(newRating);
      }
    });
  };

  const displayRating = hoveredRating ?? rating ?? 0;

  const getRatingLabel = (value: number | null): string => {
    if (value === null) return "Not rated";
    switch (value) {
      case 1:
        return "Poor";
      case 2:
        return "Fair";
      case 3:
        return "Good";
      case 4:
        return "Great";
      case 5:
        return "Excellent";
      default:
        return "";
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => handleClick(value)}
            onMouseEnter={() => setHoveredRating(value)}
            onMouseLeave={() => setHoveredRating(null)}
            disabled={disabled || isPending}
            className={cn(
              "rounded-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled || isPending
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:scale-110"
            )}
            aria-label={`Rate ${value} stars`}
          >
            <Star
              className={cn(
                sizeClasses[size],
                "transition-colors",
                value <= displayRating
                  ? "fill-yellow-400 text-yellow-400"
                  : "fill-transparent text-muted-foreground"
              )}
            />
          </button>
        ))}
        {isPending && <Loader2 className={cn(sizeClasses[size], "ml-2 animate-spin text-muted-foreground")} />}
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground">
          {hoveredRating
            ? getRatingLabel(hoveredRating)
            : rating
            ? `Your rating: ${getRatingLabel(rating)}`
            : "Click to rate"}
        </span>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
