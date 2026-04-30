"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MergeDialog } from "@/components/admin/topics/merge-dialog";
import type { CanonicalTopicRow } from "@/lib/admin/topic-queries";

interface MergeDialogTriggerProps {
  topic: CanonicalTopicRow;
}

export function MergeDialogTrigger({ topic }: MergeDialogTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Merge
      </Button>
      {open && (
        <MergeDialog topic={topic} open={open} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
