"use client";

import Link from "next/link";
import { useQueryState } from "nuqs";
import { topicDetailSearchParams } from "@/lib/search-params/topic-detail";
import { Headphones, Bookmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { TopicEpisode } from "@/app/actions/topics";

export interface TopicEpisodeListProps {
  episodes: TopicEpisode[];
}

const TOGGLE_LABEL = "Show only episodes I haven't heard";

function formatCoverage(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function buildEpisodeHref(episode: TopicEpisode): string {
  return `/episode/${episode.id}`;
}

export function TopicEpisodeList({ episodes }: TopicEpisodeListProps) {
  const [unheard, setUnheard] = useQueryState(
    "unheard",
    topicDetailSearchParams.unheard.withOptions({
      shallow: false,
      history: "replace",
    }),
  );

  const handleToggle = async (next: boolean) => {
    await setUnheard(next);
  };

  return (
    <section aria-label="Episodes" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id="unheard-toggle"
          checked={unheard}
          onCheckedChange={(state) => void handleToggle(state === true)}
        />
        <Label htmlFor="unheard-toggle" className="text-sm">
          {TOGGLE_LABEL}
        </Label>
      </div>

      {episodes.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {unheard
              ? "All caught up — no unheard episodes for this topic."
              : "No episodes yet for this topic."}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Episode</th>
                <th className="px-3 py-2 font-medium">Podcast</th>
                <th className="px-3 py-2 font-medium">Coverage</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((episode) => (
                <tr
                  key={episode.id}
                  className={cn(
                    "border-t",
                    episode.isListened && "bg-muted/30",
                  )}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={buildEpisodeHref(episode)}
                      className="font-medium text-foreground hover:underline"
                    >
                      {episode.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {episode.podcastTitle}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatCoverage(episode.coverageScore)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {episode.isListened && (
                        <Badge variant="secondary" className="gap-1">
                          <Headphones className="h-3 w-3" aria-hidden="true" />
                          Listened
                        </Badge>
                      )}
                      {episode.isSaved && (
                        <Badge variant="outline" className="gap-1">
                          <Bookmark className="h-3 w-3" aria-hidden="true" />
                          Saved
                        </Badge>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
