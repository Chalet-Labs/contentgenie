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
  bulkMergeCanonicals,
} from "@/app/actions/topics";
import type { CanonicalTopicRow } from "@/lib/admin/topic-queries";

interface BulkMergeDialogProps {
  selectedTopics: CanonicalTopicRow[];
  open: boolean;
  onClose: () => void;
}

export function BulkMergeDialog({
  selectedTopics,
  open,
  onClose,
}: BulkMergeDialogProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CanonicalTopicRow[]>([]);
  const [winner, setWinner] = useState<CanonicalTopicRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loserIds = new Set(selectedTopics.map((t) => t.id));
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (open) {
      setSearch("");
      setResults([]);
      setWinner(null);
      setSubmitting(false);
    }
  }, [open]);

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
    })
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setResults(res.data.rows.filter((r) => !loserIds.has(r.id)));
        } else {
          toast.error(`Search failed: ${res.error}`);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(
          `Search failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      });
    return () => {
      cancelled = true;
    };
    // loserIds is derived from selectedTopics — include selectedTopics as dep, not the Set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredSearch, selectedTopics]);

  async function handleConfirm() {
    if (!winner) return;
    setSubmitting(true);
    try {
      const result = await bulkMergeCanonicals({
        loserIds: selectedTopics.map((t) => t.id),
        winnerId: winner.id,
      });
      if (result.success) {
        const { succeeded, failed } = result.data;
        if (failed === 0) {
          toast.success(
            `Bulk merge complete: ${succeeded} topic(s) merged into "${winner.label}".`,
          );
        } else {
          toast.error(
            `Bulk merge partial: ${succeeded} succeeded, ${failed} failed.`,
          );
        }
        onClose();
        router.refresh();
      } else {
        toast.error(`Bulk merge failed: ${result.error}`);
      }
    } catch (err) {
      toast.error(
        `Bulk merge failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
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
          <DialogTitle>Bulk merge topics</DialogTitle>
          <DialogDescription>
            Merge {selectedTopics.length} topic(s) into a winner. All losers
            will be marked as merged and their episodes reassigned.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-3 text-sm">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Losers ({selectedTopics.length})
          </p>
          {selectedTopics.map((t) => (
            <div key={t.id} className="text-foreground">
              {t.label} <span className="text-muted-foreground">#{t.id}</span>
            </div>
          ))}
        </div>

        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search winner topic…"
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
                  onSelect={() => setWinner(r)}
                  className={winner?.id === r.id ? "bg-accent" : undefined}
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

        {winner && (
          <p className="text-sm">
            Winner: <strong>{winner.label}</strong>
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!winner || submitting}
            aria-disabled={!winner || submitting}
          >
            {submitting
              ? "Merging…"
              : `Merge ${selectedTopics.length} topic(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
