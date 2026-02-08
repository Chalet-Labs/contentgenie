"use client";

import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import type { SummaryStatus } from "@/db/schema";

interface ProcessingStatusProps {
  status: SummaryStatus | null | undefined;
  className?: string;
}

export function ProcessingStatus({ status, className }: ProcessingStatusProps) {
  if (!status) return null;

  switch (status) {
    case "queued":
      return (
        <Badge variant="secondary" className={className}>
          Queued
        </Badge>
      );
    case "running":
    case "transcribing":
      return (
        <Badge variant="secondary" className={className}>
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Transcribing...
        </Badge>
      );
    case "summarizing":
      return (
        <Badge variant="secondary" className={className}>
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Summarizing...
        </Badge>
      );
    case "completed":
      return (
        <Badge className={className}>
          <CheckCircle className="mr-1 h-3 w-3" />
          Summarized
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className={className}>
          <AlertCircle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      );
  }
}
