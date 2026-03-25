"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect, useCallback } from "react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronsUpDown, X } from "lucide-react"
import type { EpisodeFilters } from "@/lib/admin/episode-filters"

const TRANSCRIPT_STATUSES = ["missing", "fetching", "available", "failed"]
const SUMMARY_STATUSES = ["queued", "running", "summarizing", "completed", "failed"]

interface PodcastOption {
  id: number
  title: string
}

interface EpisodeFiltersProps {
  podcasts: PodcastOption[]
  initialFilters: EpisodeFilters
}

export function EpisodeFiltersBar({ podcasts, initialFilters }: EpisodeFiltersProps) {
  const router = useRouter()

  // Local filter state tracks optimistic updates so rapid successive clicks
  // don't overwrite each other (each click reads the latest local state, not
  // the stale server-rendered initialFilters prop).
  const [filters, setFilters] = useState(initialFilters)

  // Sync back when the server re-renders with new searchParams
  useEffect(() => { setFilters(initialFilters) }, [initialFilters])

  const pushFilters = useCallback(
    (next: typeof filters) => {
      const params = new URLSearchParams()

      if (next.podcastId !== undefined)
        params.set("podcastId", String(next.podcastId))
      if (next.transcriptStatuses?.length)
        next.transcriptStatuses.forEach((s) => params.append("transcriptStatus", s))
      if (next.summaryStatuses?.length)
        next.summaryStatuses.forEach((s) => params.append("summaryStatus", s))
      if (next.dateFrom)
        params.set("dateFrom", next.dateFrom.toISOString().split("T")[0])
      if (next.dateTo)
        params.set("dateTo", next.dateTo.toISOString().split("T")[0])

      router.push(`?${params.toString()}`)
    },
    [router]
  )

  const updateFilter = useCallback(
    (patch: Partial<typeof filters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch }
        pushFilters(next)
        return next
      })
    },
    [pushFilters]
  )

  const selectedPodcast = podcasts.find((p) => p.id === filters.podcastId)

  const toggleStatus = (
    type: "transcriptStatuses" | "summaryStatuses",
    status: string,
  ) => {
    setFilters((prev) => {
      const cur = prev[type] ?? []
      const next = cur.includes(status)
        ? cur.filter((s) => s !== status)
        : [...cur, status]
      const updated = { ...prev, [type]: next.length > 0 ? next : undefined }
      pushFilters(updated)
      return updated
    })
  }

  const handleClearAll = () => {
    setFilters({ page: 1 })
    router.push("?")
  }

  const hasFilters =
    filters.podcastId !== undefined ||
    (filters.transcriptStatuses?.length ?? 0) > 0 ||
    (filters.summaryStatuses?.length ?? 0) > 0 ||
    filters.dateFrom !== undefined ||
    filters.dateTo !== undefined

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Podcast filter */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            {selectedPodcast ? selectedPodcast.title : "All podcasts"}
            <ChevronsUpDown className="size-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Search podcasts…" />
            <CommandList>
              <CommandEmpty>No podcasts found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="all"
                  onSelect={() => updateFilter({ podcastId: undefined })}
                >
                  All podcasts
                </CommandItem>
                {podcasts.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.title}
                    onSelect={() => updateFilter({ podcastId: p.id })}
                  >
                    {p.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Transcript status filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Transcript
            {(filters.transcriptStatuses?.length ?? 0) > 0 &&
              ` (${filters.transcriptStatuses!.length})`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {TRANSCRIPT_STATUSES.map((s) => (
            <DropdownMenuCheckboxItem
              key={s}
              checked={filters.transcriptStatuses?.includes(s) ?? false}
              onCheckedChange={() =>
                toggleStatus("transcriptStatuses", s)
              }
            >
              {s}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Summary status filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Summary
            {(filters.summaryStatuses?.length ?? 0) > 0 &&
              ` (${filters.summaryStatuses!.length})`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {SUMMARY_STATUSES.map((s) => (
            <DropdownMenuCheckboxItem
              key={s}
              checked={filters.summaryStatuses?.includes(s) ?? false}
              onCheckedChange={() =>
                toggleStatus("summaryStatuses", s)
              }
            >
              {s}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Date range */}
      <Input
        type="date"
        aria-label="Published from date"
        value={
          filters.dateFrom
            ? filters.dateFrom.toISOString().split("T")[0]
            : ""
        }
        onChange={(e) => {
          const d = e.target.value ? new Date(e.target.value) : undefined
          const from = d && !isNaN(d.getTime()) ? d : undefined
          // Swap if from > to
          if (from && filters.dateTo && from > filters.dateTo) {
            updateFilter({ dateFrom: filters.dateTo, dateTo: from })
          } else {
            updateFilter({ dateFrom: from })
          }
        }}
        placeholder="From"
        title="Published from"
        className="w-auto"
      />
      <Input
        type="date"
        aria-label="Published to date"
        value={
          filters.dateTo
            ? filters.dateTo.toISOString().split("T")[0]
            : ""
        }
        onChange={(e) => {
          const d = e.target.value ? new Date(e.target.value) : undefined
          const to = d && !isNaN(d.getTime()) ? d : undefined
          // Swap if to < from
          if (to && filters.dateFrom && to < filters.dateFrom) {
            updateFilter({ dateFrom: to, dateTo: filters.dateFrom })
          } else {
            updateFilter({ dateTo: to })
          }
        }}
        placeholder="To"
        title="Published to"
        className="w-auto"
      />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={handleClearAll} className="gap-1">
          <X className="size-3" />
          Clear all
        </Button>
      )}
    </div>
  )
}
