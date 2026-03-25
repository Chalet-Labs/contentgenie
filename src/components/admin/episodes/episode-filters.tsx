"use client"

import { useRouter } from "next/navigation"
import { useCallback } from "react"
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

  const updateParams = useCallback(
    (updates: Record<string, string | string[] | undefined>) => {
      const params = new URLSearchParams()

      // Start from existing values
      if (initialFilters.podcastId !== undefined)
        params.set("podcastId", String(initialFilters.podcastId))
      if (initialFilters.transcriptStatuses?.length)
        initialFilters.transcriptStatuses.forEach((s) => params.append("transcriptStatus", s))
      if (initialFilters.summaryStatuses?.length)
        initialFilters.summaryStatuses.forEach((s) => params.append("summaryStatus", s))
      if (initialFilters.dateFrom)
        params.set("dateFrom", initialFilters.dateFrom.toISOString().split("T")[0])
      if (initialFilters.dateTo)
        params.set("dateTo", initialFilters.dateTo.toISOString().split("T")[0])
      // Reset page on any filter change
      params.delete("page")

      // Apply updates
      for (const [key, value] of Object.entries(updates)) {
        params.delete(key)
        if (value === undefined) continue
        if (Array.isArray(value)) {
          value.forEach((v) => params.append(key, v))
        } else {
          params.set(key, value)
        }
      }

      router.push(`?${params.toString()}`)
    },
    [initialFilters, router]
  )

  const selectedPodcast = podcasts.find((p) => p.id === initialFilters.podcastId)

  const toggleStatus = (
    type: "transcriptStatus" | "summaryStatus",
    status: string,
    current: string[] | undefined
  ) => {
    const cur = current ?? []
    const next = cur.includes(status)
      ? cur.filter((s) => s !== status)
      : [...cur, status]
    updateParams({ [type]: next.length > 0 ? next : undefined })
  }

  const handleClearAll = () => {
    router.push("?")
  }

  const hasFilters =
    initialFilters.podcastId !== undefined ||
    (initialFilters.transcriptStatuses?.length ?? 0) > 0 ||
    (initialFilters.summaryStatuses?.length ?? 0) > 0 ||
    initialFilters.dateFrom !== undefined ||
    initialFilters.dateTo !== undefined

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
                  onSelect={() => updateParams({ podcastId: undefined })}
                >
                  All podcasts
                </CommandItem>
                {podcasts.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.title}
                    onSelect={() => updateParams({ podcastId: String(p.id) })}
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
            {(initialFilters.transcriptStatuses?.length ?? 0) > 0 &&
              ` (${initialFilters.transcriptStatuses!.length})`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {TRANSCRIPT_STATUSES.map((s) => (
            <DropdownMenuCheckboxItem
              key={s}
              checked={initialFilters.transcriptStatuses?.includes(s) ?? false}
              onCheckedChange={() =>
                toggleStatus("transcriptStatus", s, initialFilters.transcriptStatuses)
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
            {(initialFilters.summaryStatuses?.length ?? 0) > 0 &&
              ` (${initialFilters.summaryStatuses!.length})`}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {SUMMARY_STATUSES.map((s) => (
            <DropdownMenuCheckboxItem
              key={s}
              checked={initialFilters.summaryStatuses?.includes(s) ?? false}
              onCheckedChange={() =>
                toggleStatus("summaryStatus", s, initialFilters.summaryStatuses)
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
          initialFilters.dateFrom
            ? initialFilters.dateFrom.toISOString().split("T")[0]
            : ""
        }
        onChange={(e) => updateParams({ dateFrom: e.target.value || undefined })}
        placeholder="From"
        title="Published from"
        className="w-auto"
      />
      <Input
        type="date"
        aria-label="Published to date"
        value={
          initialFilters.dateTo
            ? initialFilters.dateTo.toISOString().split("T")[0]
            : ""
        }
        onChange={(e) => updateParams({ dateTo: e.target.value || undefined })}
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
