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
import type { EpisodeRow } from "@/lib/admin/episode-queries"

interface EpisodesTableProps {
  episodes: EpisodeRow[]
  totalCount: number
  currentPage: number
}

function relativeDate(date: Date | null): string {
  if (!date) return "—"
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  const diff = Date.now() - new Date(date).getTime()
  const days = Math.round(diff / 86400000)
  const months = Math.round(diff / (86400000 * 30))
  const years = Math.round(diff / (86400000 * 365))
  if (Math.abs(days) < 30) return rtf.format(-days, "day")
  if (Math.abs(months) < 12) return rtf.format(-months, "month")
  return rtf.format(-years, "year")
}

export function EpisodesTable({ episodes: rows, totalCount, currentPage }: EpisodesTableProps) {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasPrev = currentPage > 1
  const hasNext = currentPage < totalPages

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
                    href={`/episode/${ep.id}`}
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
                <Link href={`?page=${currentPage - 1}`}>Previous</Link>
              </Button>
            )}
            {hasNext && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`?page=${currentPage + 1}`}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
