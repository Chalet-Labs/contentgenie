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
import { getScoreColor, getScoreLabel } from "@/lib/score-utils";

export type SummarizationStep =
  | "fetching-episode"
  | "fetching-podcast"
  | "fetching-transcript"
  | "transcribing-audio"
  | "generating-summary"
  | "saving-results"
  | "completed";

interface SummaryDisplayProps {
  summary: string | null;
  keyTakeaways: string[] | null;
  worthItScore: number | null;
  worthItReason?: string;
  worthItDimensions?: {
    uniqueness: number;
    actionability: number;
    timeValue: number;
  } | null;
  isLoading?: boolean;
  error?: string | null;
  currentStep?: SummarizationStep | null;
  onGenerateSummary?: () => void;
}

const STEP_LABELS: Record<SummarizationStep, string> = {
  "fetching-episode": "Fetching episode data",
  "fetching-podcast": "Fetching podcast info",
  "fetching-transcript": "Fetching transcript",
  "transcribing-audio": "Transcribing audio",
  "generating-summary": "Generating AI summary",
  "saving-results": "Saving results",
  completed: "Complete",
};

const STEP_ORDER: SummarizationStep[] = [
  "fetching-episode",
  "fetching-podcast",
  "fetching-transcript",
  "transcribing-audio",
  "generating-summary",
  "saving-results",
];

const DIMENSION_LABELS: Record<string, string> = {
  uniqueness: "Uniqueness",
  actionability: "Actionability",
  timeValue: "Time Value",
};

function parseStructuredSections(text: string) {
  const sections = text.split(/^## /m);
  return sections.map((section, index) => {
    if (index === 0 && !text.startsWith("## ")) {
      if (!section.trim()) return null;
      return { heading: null, body: section.trim() };
    }
    const newlineIndex = section.indexOf("\n");
    const heading = newlineIndex !== -1 ? section.slice(0, newlineIndex).trim() : section.trim();
    const body = newlineIndex !== -1 ? section.slice(newlineIndex + 1).trim() : "";
    if (!heading && !body) return null;
    return { heading, body };
  }).filter(Boolean) as { heading: string | null; body: string }[];
}

function renderSections(sections: { heading: string | null; body: string }[]): React.ReactNode[] {
  return sections.map((section, index) => {
    if (!section.heading) {
      return (
        <div key={index} className="whitespace-pre-wrap text-muted-foreground">
          {section.body}
        </div>
      );
    }
    return (
      <div key={index} className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{section.heading}</h3>
        {section.body && (
          <div className="whitespace-pre-wrap text-muted-foreground">{section.body}</div>
        )}
      </div>
    );
  });
}

export function SummaryDisplay({
  summary,
  keyTakeaways,
  worthItScore,
  worthItReason,
  worthItDimensions,
  isLoading = false,
  error = null,
  currentStep = null,
  onGenerateSummary,
}: SummaryDisplayProps) {
  const [showFullSummary, setShowFullSummary] = useState(false);

  // Loading state with step progress
  if (isLoading) {
    const activeStepIndex = currentStep
      ? STEP_ORDER.indexOf(currentStep)
      : -1;

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Generating Summary...
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentStep ? (
              <ul className="space-y-2">
                {STEP_ORDER.map((step, index) => {
                  const isActive = step === currentStep;
                  const isCompleted = index < activeStepIndex;
                  return (
                    <li
                      key={step}
                      className="flex items-center gap-3 text-sm"
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      ) : (
                        <div className="h-4 w-4 shrink-0 rounded-full border-2 border-muted" />
                      )}
                      <span
                        className={
                          isActive
                            ? "font-medium text-foreground"
                            : isCompleted
                              ? "text-muted-foreground line-through"
                              : "text-muted-foreground"
                        }
                      >
                        {STEP_LABELS[step]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}
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
  const hasStructuredSections = summary.includes("## ");
  const structuredSections = hasStructuredSections ? parseStructuredSections(summary) : [];
  const isLongSummary = hasStructuredSections
    ? structuredSections.length > 1
    : summary.length > 600;
  const displaySummary =
    isLongSummary && !showFullSummary
      ? summary.slice(0, 600) + "..."
      : summary;
  const normalizedDimensionEntries = worthItDimensions
    ? Object.entries(worthItDimensions).reduce<[string, number][]>((acc, [key, raw]) => {
        const num = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
        if (!Number.isFinite(num)) return acc;
        acc.push([key, Math.min(10, Math.max(0, num))]);
        return acc;
      }, [])
    : [];

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
            {normalizedDimensionEntries.length > 0 && (
              <div className="mt-4 space-y-3 border-t pt-4">
                <p className="text-sm font-medium text-foreground">Score Breakdown</p>
                {normalizedDimensionEntries.map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{DIMENSION_LABELS[key] ?? key}</span>
                      <span className="font-medium">{value.toFixed(1)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${getScoreColor(value)} transition-all`}
                        style={{ width: `${(value / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
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
          {hasStructuredSections ? (
            <div className="space-y-4">
              {renderSections(
                showFullSummary ? structuredSections : structuredSections.slice(0, 1)
              )}
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-muted-foreground">
              {displaySummary}
            </p>
          )}
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
