import Link from "next/link"
import Image from "next/image"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/admin/episodes/status-badge"
import { RowCheckbox } from "@/components/admin/episodes/row-checkbox"
import { EpisodeActionButtons } from "@/components/admin/episodes/episode-action-buttons"
import { PAGE_SIZE } from "@/lib/admin/episode-filters"
import { relativeTime } from "@/lib/admin/format-utils"
import type { EpisodeRow } from "@/lib/admin/episode-queries"

interface EpisodesTableProps {
  episodes: EpisodeRow[]
  totalCount: number
  currentPage: number
  searchParams?: Record<string, string | string[] | undefined>
}

function relativeDate(date: Date | null): string {
  if (!date) return "—"
  return relativeTime(date)
}

export function EpisodesTable({ episodes: rows, totalCount, currentPage, searchParams = {} }: EpisodesTableProps) {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasPrev = currentPage > 1
  const hasNext = currentPage < totalPages

  function buildPageLink(page: number) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
      if (key !== "page" && value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => params.append(key, v))
        } else {
          params.set(key, value)
        }
      }
    }
    params.set("page", String(page))
    return `?${params.toString()}`
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        No episodes found.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Podcast</TableHead>
              <TableHead>Episode</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Transcript</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((ep) => (
              <TableRow key={ep.id}>
                <TableCell>
                  <RowCheckbox episodeId={ep.id} />
                </TableCell>
                <TableCell className="max-w-[120px]">
                  <div className="flex items-center gap-2">
                    {ep.podcastImageUrl && (
                      <Image
                        src={ep.podcastImageUrl}
                        alt=""
                        width={24}
                        height={24}
                        className="rounded object-cover flex-shrink-0"
                      />
                    )}
                    <span className="truncate text-sm">{ep.podcastTitle}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-[200px]">
                  <Link
                    href={`/episode/${ep.podcastIndexId}`}
                    className="text-sm hover:underline truncate block"
                  >
                    {ep.title}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {relativeDate(ep.publishDate)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={ep.transcriptStatus} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {ep.transcriptSource ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={ep.summaryStatus} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ep.worthItScore ?? "—"}
                </TableCell>
                <TableCell>
                  <EpisodeActionButtons
                    episode={{
                      id: ep.id,
                      transcriptStatus: ep.transcriptStatus,
                      summaryStatus: ep.summaryStatus,
                      podcastIndexId: ep.podcastIndexId,
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
          <span>
            Page {currentPage} of {totalPages} ({totalCount} episodes)
          </span>
          <div className="flex gap-2">
            {hasPrev && (
              <Button variant="outline" size="sm" asChild>
                <Link href={buildPageLink(currentPage - 1)}>Previous</Link>
              </Button>
            )}
            {hasNext && (
              <Button variant="outline" size="sm" asChild>
                <Link href={buildPageLink(currentPage + 1)}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
