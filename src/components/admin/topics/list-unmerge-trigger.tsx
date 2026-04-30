"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UnmergeDialog } from "@/components/admin/topics/unmerge-dialog";
import { getUnmergeSuggestions } from "@/app/actions/topics";
import type { CanonicalTopicRow } from "@/lib/admin/topic-queries";

interface EpisodeItem {
  id: number;
  title: string;
}

interface ListUnmergeTriggerProps {
  topic: CanonicalTopicRow;
}

export function ListUnmergeTrigger({ topic }: ListUnmergeTriggerProps) {
  const [open, setOpen] = useState(false);
  const [episodes, setEpisodes] = useState<EpisodeItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (episodes !== null) {
      setOpen(true);
      return;
    }
    setLoading(true);
    try {
      const res = await getUnmergeSuggestions({ loserId: topic.id });
      if (res.success) {
        setEpisodes(res.data);
        setOpen(true);
      } else {
        toast.error(`Failed to load suggestions: ${res.error}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        aria-expanded={open}
        disabled={loading}
        onClick={handleClick}
      >
        {loading ? "Loading…" : "Unmerge"}
      </Button>
      {open && episodes !== null && (
        <UnmergeDialog
          topic={topic}
          suggestedEpisodes={episodes}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
