"use client";

import { useState, useEffect } from "react";
import { Star, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getEpisodeAverageRating } from "@/app/actions/library";
import { cn } from "@/lib/utils";

interface CommunityRatingProps {
  episodePodcastIndexId: string;
  size?: "sm" | "md" | "lg";
  showCount?: boolean;
}

export function CommunityRating({
  episodePodcastIndexId,
  size = "md",
  showCount = true,
}: CommunityRatingProps) {
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRating() {
      setIsLoading(true);
      setError(null);

      const result = await getEpisodeAverageRating(episodePodcastIndexId);

      if (result.error) {
        setError(result.error);
      } else {
        setAverageRating(result.averageRating);
        setRatingCount(result.ratingCount);
      }

      setIsLoading(false);
    }

    fetchRating();
  }, [episodePodcastIndexId]);

  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className={cn("rounded", size === "sm" ? "h-3 w-16" : size === "md" ? "h-4 w-20" : "h-5 w-24")} />
      </div>
    );
  }

  if (error || averageRating === null || ratingCount === 0) {
    return (
      <div className={cn("flex items-center gap-1 text-muted-foreground", textSizeClasses[size])}>
        <Star className={cn(sizeClasses[size], "fill-transparent")} />
        <span>No ratings yet</span>
      </div>
    );
  }

  // Render filled stars based on average
  const fullStars = Math.floor(averageRating);
  const hasHalfStar = averageRating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className={cn("flex items-center gap-2", textSizeClasses[size])}>
      <div className="flex items-center">
        {/* Full stars */}
        {Array.from({ length: fullStars }).map((_, i) => (
          <Star
            key={`full-${i}`}
            className={cn(sizeClasses[size], "fill-yellow-400 text-yellow-400")}
          />
        ))}
        {/* Half star (simplified as full for now) */}
        {hasHalfStar && (
          <Star
            className={cn(sizeClasses[size], "fill-yellow-400/50 text-yellow-400")}
          />
        )}
        {/* Empty stars */}
        {Array.from({ length: emptyStars }).map((_, i) => (
          <Star
            key={`empty-${i}`}
            className={cn(sizeClasses[size], "fill-transparent text-muted-foreground")}
          />
        ))}
      </div>
      <span className="font-medium">{averageRating.toFixed(1)}</span>
      {showCount && (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Users className={sizeClasses[size]} />
          {ratingCount} {ratingCount === 1 ? "rating" : "ratings"}
        </span>
      )}
    </div>
  );
}
