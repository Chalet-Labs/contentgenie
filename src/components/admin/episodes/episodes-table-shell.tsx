"use client"

import { useState, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { SelectionContext } from "@/components/admin/episodes/selection-context"

interface EpisodesTableShellProps {
  children: React.ReactNode
}

export function EpisodesTableShell({ children }: EpisodesTableShellProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isBatching, setIsBatching] = useState(false)

  const toggle = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback((ids: number[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  const clearAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleBatchResummarize = async () => {
    if (selectedIds.size === 0) return
    setIsBatching(true)
    try {
      const res = await fetch("/api/admin/batch-resummarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeIds: Array.from(selectedIds) }),
      })

      if (!res.ok) {
        const msg = await res.json().catch(() => ({ error: "Unknown error" }))
        toast.error(msg.error ?? "Batch resummarize failed")
        return
      }

      const { queued, skipped } = await res.json()
      toast.success(
        `${queued} episode${queued !== 1 ? "s" : ""} queued for summarization${skipped > 0 ? ` (${skipped} skipped — no transcript)` : ""}`
      )
      clearAll()
    } catch (err) {
      toast.error("Batch resummarize failed: " + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsBatching(false)
    }
  }

  return (
    <SelectionContext.Provider value={{ selectedIds, toggle, selectAll, clearAll }}>
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2 mb-2">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm"
            onClick={handleBatchResummarize}
            disabled={isBatching}
          >
            {isBatching ? "Queuing…" : "Re-summarize selected"}
          </Button>
          <Button size="sm" variant="ghost" onClick={clearAll}>
            Clear selection
          </Button>
        </div>
      )}
      {children}
    </SelectionContext.Provider>
  )
}
