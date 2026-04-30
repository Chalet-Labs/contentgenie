"use client";

import { useState, useDeferredValue, useEffect } from "react";
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
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  getCanonicalTopicsList,
  adminMergeCanonicals,
} from "@/app/actions/topics";
import type { CanonicalTopicRow } from "@/lib/admin/topic-queries";

interface MergeDialogProps {
  topic: CanonicalTopicRow;
  open: boolean;
  onClose: () => void;
}

export function MergeDialog({ topic, open, onClose }: MergeDialogProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CanonicalTopicRow[]>([]);
  const [selected, setSelected] = useState<CanonicalTopicRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!deferredSearch) {
      setResults([]);
      return;
    }
    let cancelled = false;
    getCanonicalTopicsList({
      search: deferredSearch,
      status: "active",
      page: 1,
    }).then((res) => {
      if (cancelled) return;
      if (res.success) {
        setResults(res.data.rows.filter((r) => r.id !== topic.id));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deferredSearch, topic.id]);

  async function handleConfirm() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const result = await adminMergeCanonicals({
        loserId: topic.id,
        winnerId: selected.id,
      });
      if (result.success) {
        toast.success(
          `Merged "${topic.label}" into "${selected.label}". ${result.data.episodesReassigned} episode(s) reassigned.`,
        );
        onClose();
        router.refresh();
      } else {
        toast.error(`Merge failed: ${result.error}`);
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
          <DialogTitle>Merge topic</DialogTitle>
          <DialogDescription>
            Merge <strong className="text-foreground">{topic.label}</strong>{" "}
            into another topic. This topic will be marked as merged and its
            episodes reassigned.
          </DialogDescription>
        </DialogHeader>

        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search topics…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {results.length === 0 && search ? (
              <CommandEmpty>No topics found.</CommandEmpty>
            ) : (
              results.map((r) => (
                <CommandItem
                  key={r.id}
                  value={String(r.id)}
                  onSelect={() => setSelected(r)}
                  className={selected?.id === r.id ? "bg-accent" : undefined}
                >
                  {r.label}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {r.kind} · {r.episodeCount} ep
                  </span>
                </CommandItem>
              ))
            )}
          </CommandList>
        </Command>

        {selected && (
          <p className="text-sm">
            Winner: <strong>{selected.label}</strong>
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selected || submitting}
            aria-disabled={!selected || submitting}
          >
            {submitting ? "Merging…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
