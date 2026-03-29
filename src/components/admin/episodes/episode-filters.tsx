"use client"

import { useQueryStates } from "nuqs"
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
import { adminEpisodeSearchParams } from "@/lib/search-params/admin-episodes"

const TRANSCRIPT_STATUSES = ["missing", "fetching", "available", "failed"]
const SUMMARY_STATUSES = ["queued", "running", "summarizing", "completed", "failed"]

interface PodcastOption {
  id: number
  title: string
}

interface EpisodeFiltersProps {
  podcasts: PodcastOption[]
}

export function EpisodeFiltersBar({ podcasts }: EpisodeFiltersProps) {
  const [filters, setFilters] = useQueryStates(adminEpisodeSearchParams, {
    shallow: false,
    history: "replace",
  })

  const selectedPodcast = podcasts.find((p) => p.id === filters.podcastId)

  const toggleStatus = (type: "transcriptStatus" | "summaryStatus", status: string) => {
    const cur = filters[type] ?? []
    const next = cur.includes(status)
      ? cur.filter((s) => s !== status)
      : [...cur, status]
    setFilters({ [type]: next.length > 0 ? next : null })
  }

  const handleClearAll = () => {
    setFilters({
      podcastId: null,
      transcriptStatus: null,
      summaryStatus: null,
      dateFrom: null,
      dateTo: null,
      page: 1,
    })
  }

  const hasFilters =
    filters.podcastId !== null ||
    (filters.transcriptStatus?.length ?? 0) > 0 ||
    (filters.summaryStatus?.length ?? 0) > 0 ||
    filters.dateFrom !== null ||
    filters.dateTo !== null

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
                  onSelect={() => setFilters({ podcastId: null })}
                >
                  All podcasts
                </CommandItem>
                {podcasts.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.title}
                    onSelect={() => setFilters({ podcastId: p.id })}
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
            {(filters.transcriptStatus?.length ?? 0) > 0 &&
              ` (${filters.transcriptStatus!.length})`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {TRANSCRIPT_STATUSES.map((s) => (
            <DropdownMenuCheckboxItem
              key={s}
              checked={filters.transcriptStatus?.includes(s) ?? false}
              onCheckedChange={() => toggleStatus("transcriptStatus", s)}
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
            {(filters.summaryStatus?.length ?? 0) > 0 &&
              ` (${filters.summaryStatus!.length})`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {SUMMARY_STATUSES.map((s) => (
            <DropdownMenuCheckboxItem
              key={s}
              checked={filters.summaryStatus?.includes(s) ?? false}
              onCheckedChange={() => toggleStatus("summaryStatus", s)}
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
        value={filters.dateFrom ? filters.dateFrom.toISOString().split("T")[0] : ""}
        onChange={(e) => {
          const d = e.target.value ? new Date(e.target.value) : null
          const from = d && !isNaN(d.getTime()) ? d : null
          if (from && filters.dateTo && from > filters.dateTo) {
            setFilters({ dateFrom: filters.dateTo, dateTo: from })
          } else {
            setFilters({ dateFrom: from })
          }
        }}
        placeholder="From"
        title="Published from"
        className="w-auto"
      />
      <Input
        type="date"
        aria-label="Published to date"
        value={filters.dateTo ? filters.dateTo.toISOString().split("T")[0] : ""}
        onChange={(e) => {
          const d = e.target.value ? new Date(e.target.value) : null
          const to = d && !isNaN(d.getTime()) ? d : null
          if (to && filters.dateFrom && to < filters.dateFrom) {
            setFilters({ dateFrom: to, dateTo: filters.dateFrom })
          } else {
            setFilters({ dateTo: to })
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
