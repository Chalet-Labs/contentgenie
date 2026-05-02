"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
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
import { triggerFullResummarize } from "@/app/actions/topics";
import type { LinkedEpisodeRow } from "@/lib/admin/topic-queries";
import { IN_PROGRESS_STATUSES } from "@/db/schema";

interface LinkedEpisodesPanelProps {
  episodes: LinkedEpisodeRow[];
}

export function LinkedEpisodesPanel({ episodes }: LinkedEpisodesPanelProps) {
  const [pending, setPending] = useState<number | null>(null);

  async function handleResummarize(episodeId: number) {
    setPending(episodeId);
    try {
      const result = await triggerFullResummarize({ episodeId });
      if (result.success) {
        toast.success(`Re-summarize queued (run ${result.data.runId}).`);
      } else {
        toast.error(`Re-summarize failed: ${result.error}`);
      }
    } catch (err) {
      toast.error(
        `Re-summarize failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setPending(null);
    }
  }

  if (episodes.length === 0) {
    return <p className="text-sm text-muted-foreground">No linked episodes.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Match</TableHead>
            <TableHead>Similarity</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {episodes.map((ep) => {
            const canResummarize = ep.transcriptStatus === "available";
            const isBusy =
              ep.summaryStatus !== null &&
              IN_PROGRESS_STATUSES.includes(ep.summaryStatus);
            const disabled =
              !canResummarize || isBusy || pending === ep.episodeId;

            let disabledReason: string | undefined;
            if (!canResummarize) disabledReason = "No transcript available";
            else if (isBusy) disabledReason = `Summary ${ep.summaryStatus}`;

            return (
              <TableRow key={ep.episodeId}>
                <TableCell className="text-sm text-muted-foreground">
                  {ep.episodeId}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/episode/${ep.podcastIndexId}`}
                    className="hover:underline"
                  >
                    {ep.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{ep.matchMethod}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ep.similarityToTopMatch !== null
                    ? ep.similarityToTopMatch.toFixed(3)
                    : "—"}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    aria-disabled={disabled}
                    title={disabledReason}
                    onClick={() => handleResummarize(ep.episodeId)}
                  >
                    {pending === ep.episodeId
                      ? "Queuing…"
                      : "Full re-summarize"}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
