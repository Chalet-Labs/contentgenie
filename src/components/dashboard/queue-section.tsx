"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAudioPlayerState } from "@/contexts/audio-player-context";
import { QueueList } from "@/components/audio-player/queue-list";

export function QueueSection() {
  const { queue, currentEpisode } = useAudioPlayerState();
  const episodeCount = (currentEpisode ? 1 : 0) + queue.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold">Queue</CardTitle>
        {episodeCount > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {episodeCount}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <QueueList />
      </CardContent>
    </Card>
  );
}
