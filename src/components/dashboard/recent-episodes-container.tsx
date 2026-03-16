"use client";

import { useRef, useState, useTransition } from "react";
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
  hasSubscriptions: initialHasSubscriptions,
}: RecentEpisodesContainerProps) {
  const [activeRange, setActiveRange] = useState<TimeRange>("week");
  const [episodes, setEpisodes] = useState<RecentEpisode[]>(initialEpisodes);
  const [hasSubscriptions, setHasSubscriptions] = useState(initialHasSubscriptions);
  const [isPending, startTransition] = useTransition();
  const latestRangeRef = useRef<TimeRange>("week");

  function handleRangeChange(range: TimeRange) {
    if (range === activeRange) return;
    if (range === "login" && sinceLastLogin === null) return;

    const previousRange = activeRange;
    setActiveRange(range);
    latestRangeRef.current = range;

    startTransition(async () => {
      try {
        const since =
          range === "login"
            ? sinceLastLogin!
            : Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
        const result = await getRecentEpisodesFromSubscriptions({ limit: 5, since });

        // Ignore stale results if the user toggled again while this fetch was in-flight
        if (latestRangeRef.current !== range) return;

        if (result.error) {
          console.error("Failed to load episodes:", result.error);
          setActiveRange(previousRange);
          latestRangeRef.current = previousRange;
          return;
        }

        setEpisodes(result.episodes);
        setHasSubscriptions(result.hasSubscriptions);
      } catch (error) {
        console.error("Failed to load episodes:", error);
        setActiveRange(previousRange);
        latestRangeRef.current = previousRange;
      }
    });
  }

  return (
    <div className="space-y-3">
      {sinceLastLogin !== null && (
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
          <button
            onClick={() => handleRangeChange("week")}
            disabled={isPending}
            aria-pressed={activeRange === "week"}
            className={
              activeRange === "week"
                ? "rounded-md px-3 py-1 text-sm font-medium bg-background shadow-sm disabled:opacity-50"
                : "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            }
          >
            Last week
          </button>
          <button
            onClick={() => handleRangeChange("login")}
            disabled={isPending}
            aria-pressed={activeRange === "login"}
            className={
              activeRange === "login"
                ? "rounded-md px-3 py-1 text-sm font-medium bg-background shadow-sm disabled:opacity-50"
                : "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
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
        canToggle={sinceLastLogin !== null}
      />
    </div>
  );
}
