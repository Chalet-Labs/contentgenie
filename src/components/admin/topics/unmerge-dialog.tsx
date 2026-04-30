"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { adminUnmergeCanonicals } from "@/app/actions/topics";
import type { CanonicalTopicRow } from "@/lib/admin/topic-queries";

interface EpisodeItem {
  id: number;
  title: string;
}

interface UnmergeDialogProps {
  topic: CanonicalTopicRow;
  suggestedEpisodes: EpisodeItem[];
  open: boolean;
  onClose: () => void;
}

export function UnmergeDialog({
  topic,
  suggestedEpisodes,
  open,
  onClose,
}: UnmergeDialogProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(suggestedEpisodes.map((e) => e.id)),
  );
  const [alsoRemoveFromWinner, setAlsoRemoveFromWinner] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(suggestedEpisodes.map((e) => e.id)));
    }
  }, [open, suggestedEpisodes]);

  function toggleEpisode(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const result = await adminUnmergeCanonicals({
        loserId: topic.id,
        episodeIdsToReassign: Array.from(selectedIds),
        alsoRemoveFromWinner,
      });
      if (result.success) {
        toast.success(
          `Unmerged "${topic.label}". ${result.data.episodesReassigned} episode(s) reassigned.`,
        );
        onClose();
        router.refresh();
      } else {
        toast.error(`Unmerge failed: ${result.error}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unmerge topic</DialogTitle>
          <DialogDescription>
            Unmerging <strong className="text-foreground">{topic.label}</strong>{" "}
            will restore it to active status. Select the episodes to reassign
            back to it.
          </DialogDescription>
        </DialogHeader>

        {suggestedEpisodes.length > 0 && (
          <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2">
            {suggestedEpisodes.map((ep) => (
              <div key={ep.id} className="flex items-center gap-2">
                <Checkbox
                  id={`ep-${ep.id}`}
                  checked={selectedIds.has(ep.id)}
                  onCheckedChange={() => toggleEpisode(ep.id)}
                />
                <Label
                  htmlFor={`ep-${ep.id}`}
                  className="cursor-pointer text-sm"
                >
                  {ep.title}
                </Label>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Checkbox
            id="also-remove-from-winner"
            checked={alsoRemoveFromWinner}
            onCheckedChange={(v) => setAlsoRemoveFromWinner(!!v)}
          />
          <Label htmlFor="also-remove-from-winner" className="text-sm">
            Also remove selected episodes from winner (recommended)
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting}
            aria-disabled={submitting}
          >
            {submitting ? "Unmerging…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
