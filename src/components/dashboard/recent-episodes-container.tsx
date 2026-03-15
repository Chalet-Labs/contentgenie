"use client";

import { useState, useTransition } from "react";
import { getRecentEpisodesFromSubscriptions } from "@/app/actions/dashboard";
import { RecentEpisodes } from "@/components/dashboard/recent-episodes";
import type { RecentEpisode } from "@/app/actions/dashboard";

type TimeRange = "week" | "login";

interface RecentEpisodesContainerProps {
  initialEpisodes: RecentEpisode[];
  sinceLastLogin: number | null; // Unix seconds; null if no meaningful boundary
  sinceLastWeek: number;         // Unix seconds; pre-computed server-side
  hasSubscriptions: boolean;
}

export function RecentEpisodesContainer({
  initialEpisodes,
  sinceLastLogin,
  sinceLastWeek,
  hasSubscriptions,
}: RecentEpisodesContainerProps) {
  const [activeRange, setActiveRange] = useState<TimeRange>("week");
  const [episodes, setEpisodes] = useState<RecentEpisode[]>(initialEpisodes);
  const [isPending, startTransition] = useTransition();

  function handleRangeChange(range: TimeRange) {
    if (range === activeRange) return;
    setActiveRange(range);
    startTransition(async () => {
      const since = range === "login" ? sinceLastLogin! : sinceLastWeek;
      const result = await getRecentEpisodesFromSubscriptions({ limit: 5, since });
      setEpisodes(result.episodes);
    });
  }

  return (
    <div className="space-y-3">
      {sinceLastLogin !== null && (
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
          <button
            onClick={() => handleRangeChange("week")}
            className={
              activeRange === "week"
                ? "rounded-md px-3 py-1 text-sm font-medium bg-background shadow-sm"
                : "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            }
          >
            Last week
          </button>
          <button
            onClick={() => handleRangeChange("login")}
            className={
              activeRange === "login"
                ? "rounded-md px-3 py-1 text-sm font-medium bg-background shadow-sm"
                : "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            }
          >
            Since last login
          </button>
        </div>
      )}
      <RecentEpisodes
        episodes={episodes}
        isLoading={isPending}
        hasSubscriptions={hasSubscriptions}
      />
    </div>
  );
}
