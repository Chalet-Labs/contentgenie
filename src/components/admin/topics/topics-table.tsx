"use client";

import { useState } from "react";
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
import { MergeDialog } from "@/components/admin/topics/merge-dialog";
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

  const totalPages = Math.ceil(totalCount / TOPICS_PAGE_SIZE);
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

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

  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No topics found.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
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
              {rows.map((topic) => (
                <TableRow key={topic.id}>
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
                    <Badge variant={STATUS_VARIANT[topic.status] ?? "outline"}>
                      {topic.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {topic.episodeCount}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {topic.lastSeen.toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {topic.status === "active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTopic(topic)}
                      >
                        Merge
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
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
    </>
  );
}
