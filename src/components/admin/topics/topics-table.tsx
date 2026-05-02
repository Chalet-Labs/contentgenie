"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MergeDialog } from "@/components/admin/topics/merge-dialog";
import { BulkMergeDialog } from "@/components/admin/topics/bulk-merge-dialog";
import { ListUnmergeTrigger } from "@/components/admin/topics/list-unmerge-trigger";
import { TOPICS_PAGE_SIZE } from "@/lib/admin/topic-queries";
import type { CanonicalTopicRow } from "@/lib/admin/topic-queries";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  active: "default",
  merged: "secondary",
  dormant: "outline",
};

interface TopicsTableProps {
  rows: CanonicalTopicRow[];
  totalCount: number;
  currentPage: number;
  searchParams?: Record<string, string | string[] | undefined>;
}

export function TopicsTable({
  rows,
  totalCount,
  currentPage,
  searchParams = {},
}: TopicsTableProps) {
  const [selectedTopic, setSelectedTopic] = useState<CanonicalTopicRow | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Stable change-detection key for the URL filters — the parent passes a
  // fresh object on every render, so identity alone would never compare equal.
  const filtersKey = useMemo(() => {
    const sorted = Object.entries(searchParams)
      .filter(([k]) => k !== "page")
      .map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : (v ?? "")] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(sorted);
  }, [searchParams]);

  // Drop selections when the user paginates or changes filters — otherwise
  // ghost selections from a previous page accumulate in the bulk dialog.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentPage, filtersKey]);

  const totalPages = Math.ceil(totalCount / TOPICS_PAGE_SIZE);
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const eligibleRows = rows.filter((r) => r.status === "active");
  const allEligibleSelected =
    eligibleRows.length > 0 && eligibleRows.every((r) => selectedIds.has(r.id));
  const someEligibleSelected = eligibleRows.some((r) => selectedIds.has(r.id));

  function toggleAll() {
    if (allEligibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleRows.map((r) => r.id)));
    }
  }

  function toggleRow(id: number) {
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

  function buildPageLink(page: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key !== "page" && value !== undefined) {
        params.set(key, Array.isArray(value) ? value.join(",") : value);
      }
    }
    params.set("page", String(page));
    return `?${params.toString()}`;
  }

  const selectedTopics = rows.filter((r) => selectedIds.has(r.id));

  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No topics found.
      </div>
    );
  }

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 rounded-md border bg-background p-3 shadow-sm">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} selected
          </span>
          <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
            Merge selected ({selectedIds.size})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear selection
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      allEligibleSelected
                        ? true
                        : someEligibleSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={toggleAll}
                    aria-label="Select all active topics"
                  />
                </TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Episodes</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((topic) => {
                const eligible = topic.status === "active";
                return (
                  <TableRow key={topic.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(topic.id)}
                        onCheckedChange={() => eligible && toggleRow(topic.id)}
                        disabled={!eligible}
                        aria-label={`Select ${topic.label}`}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {topic.id}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/topics/${topic.id}`}
                        className="hover:underline"
                      >
                        {topic.label}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {topic.kind}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANT[topic.status] ?? "outline"}
                      >
                        {topic.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {topic.episodeCount}
                    </TableCell>
                    <TableCell
                      className="text-sm text-muted-foreground"
                      suppressHydrationWarning
                    >
                      {topic.lastSeen.toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {topic.status === "active" && (
                        <Button
                          size="sm"
                          onClick={() => setSelectedTopic(topic)}
                        >
                          Merge
                        </Button>
                      )}
                      {topic.status === "merged" && (
                        <ListUnmergeTrigger topic={topic} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-1 py-2 text-sm text-muted-foreground">
            <span>
              Page {currentPage} of {totalPages} ({totalCount} total)
            </span>
            <div className="flex gap-2">
              {hasPrev && (
                <Button asChild variant="outline" size="sm">
                  <Link href={buildPageLink(currentPage - 1)}>Previous</Link>
                </Button>
              )}
              {hasNext && (
                <Button asChild variant="outline" size="sm">
                  <Link href={buildPageLink(currentPage + 1)}>Next</Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {selectedTopic && (
        <MergeDialog
          topic={selectedTopic}
          open={!!selectedTopic}
          onClose={() => setSelectedTopic(null)}
        />
      )}

      <BulkMergeDialog
        selectedTopics={selectedTopics}
        open={bulkDialogOpen}
        onClose={() => {
          setBulkDialogOpen(false);
          setSelectedIds(new Set());
        }}
      />
    </>
  );
}
