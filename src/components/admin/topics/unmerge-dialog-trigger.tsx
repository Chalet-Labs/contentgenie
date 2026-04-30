"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UnmergeDialog } from "@/components/admin/topics/unmerge-dialog";
import type { CanonicalTopicSummary } from "@/app/(app)/topic/[id]/merge-walker";

interface EpisodeItem {
  id: number;
  title: string;
}

interface UnmergeDialogTriggerProps {
  topic: CanonicalTopicSummary;
  suggestedEpisodes: EpisodeItem[];
}

export function UnmergeDialogTrigger({
  topic,
  suggestedEpisodes,
}: UnmergeDialogTriggerProps) {
  const [open, setOpen] = useState(false);

  // CanonicalTopicSummary's status/id/label fields satisfy CanonicalTopicRow's
  // required shape for UnmergeDialog — cast as compatible subset.
  const topicForDialog = {
    id: topic.id,
    label: topic.label,
    kind: topic.kind,
    status: topic.status,
    episodeCount: topic.episodeCount,
    lastSeen: new Date(),
    mergedIntoId: topic.mergedIntoId,
  };

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Unmerge
      </Button>
      <UnmergeDialog
        topic={topicForDialog}
        suggestedEpisodes={suggestedEpisodes}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
