"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  CheckCircle,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface SummaryDisplayProps {
  summary: string | null;
  keyTakeaways: string[] | null;
  worthItScore: number | null;
  worthItReason?: string;
  isLoading?: boolean;
  error?: string | null;
  onGenerateSummary?: () => void;
}

export function SummaryDisplay({
  summary,
  keyTakeaways,
  worthItScore,
  worthItReason,
  isLoading = false,
  error = null,
  onGenerateSummary,
}: SummaryDisplayProps) {
  const [showFullSummary, setShowFullSummary] = useState(false);

  // Determine score color and label
  const getScoreColor = (score: number) => {
    if (score >= 8) return "bg-green-500";
    if (score >= 6) return "bg-emerald-500";
    if (score >= 4) return "bg-yellow-500";
    if (score >= 2) return "bg-orange-500";
    return "bg-red-500";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 8) return "Highly Recommended";
    if (score >= 6) return "Worth Your Time";
    if (score >= 4) return "Decent";
    if (score >= 2) return "Skip Unless Interested";
    return "Not Recommended";
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Worth-it Score Skeleton */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Worth-It Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Skeleton */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Generating Summary...
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>

        {/* Key Takeaways Skeleton */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle className="h-5 w-5 text-primary" />
              Key Takeaways
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/5" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <div className="text-center">
            <p className="font-medium text-destructive">
              Failed to generate summary
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          {onGenerateSummary && (
            <Button onClick={onGenerateSummary} variant="outline">
              Try Again
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // No summary yet - show generate button
  if (!summary) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <Sparkles className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">No Summary Available</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate an AI-powered summary to get key insights from this
              episode.
            </p>
          </div>
          {onGenerateSummary && (
            <Button onClick={onGenerateSummary}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Summary
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Display summary
  const summaryLines = summary.split("\n").filter((line) => line.trim());
  const isLongSummary = summaryLines.length > 5 || summary.length > 600;
  const displaySummary =
    isLongSummary && !showFullSummary
      ? summary.slice(0, 600) + "..."
      : summary;

  return (
    <div className="space-y-6">
      {/* Worth-it Score */}
      {worthItScore !== null && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              Worth-It Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full ${getScoreColor(worthItScore)} text-white shadow-lg`}
              >
                <span className="text-2xl font-bold">
                  {worthItScore.toFixed(1)}
                </span>
              </div>
              <div>
                <p className="font-semibold">{getScoreLabel(worthItScore)}</p>
                {worthItReason && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {worthItReason}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full ${getScoreColor(worthItScore)} transition-all`}
                  style={{ width: `${(worthItScore / 10) * 100}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>5</span>
                <span>10</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-muted-foreground">
            {displaySummary}
          </p>
          {isLongSummary && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setShowFullSummary(!showFullSummary)}
            >
              {showFullSummary ? (
                <>
                  <ChevronUp className="mr-1 h-4 w-4" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 h-4 w-4" />
                  Read More
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Key Takeaways */}
      {keyTakeaways && keyTakeaways.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle className="h-5 w-5 text-primary" />
              Key Takeaways
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {keyTakeaways.map((takeaway, index) => (
                <li key={index} className="flex items-start gap-3">
                  <Badge
                    variant="secondary"
                    className="mt-0.5 h-6 w-6 shrink-0 justify-center rounded-full p-0"
                  >
                    {index + 1}
                  </Badge>
                  <span className="text-muted-foreground">{takeaway}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function SummaryDisplaySkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    </div>
  );
}
