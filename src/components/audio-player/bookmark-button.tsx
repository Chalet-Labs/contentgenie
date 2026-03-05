"use client"

import { useState, useEffect, useRef, useCallback, useTransition } from "react"
import { Bookmark, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  useAudioPlayerState,
  useAudioPlayerProgress,
} from "@/contexts/audio-player-context"
import {
  getLibraryEntryByEpisodeId,
  addBookmark,
  updateBookmark,
} from "@/app/actions/library"
import { formatTime } from "@/lib/format-time"

const AUTO_DISMISS_MS = 5000
const MAX_NOTE_LENGTH = 500

export function BookmarkButton() {
  const { currentEpisode } = useAudioPlayerState()
  const { currentTime } = useAudioPlayerProgress()
  const [libraryEntryId, setLibraryEntryId] = useState<number | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState("")
  const [lastBookmarkId, setLastBookmarkId] = useState<number | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentTimeRef = useRef(currentTime)
  currentTimeRef.current = currentTime

  // Resolve library entry ID when episode changes
  useEffect(() => {
    // Reset transient bookmark-note UI when episode context changes
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
    setNoteOpen(false)
    setNoteText("")
    setLastBookmarkId(null)

    if (!currentEpisode) {
      setLibraryEntryId(null)
      setIsResolving(false)
      return
    }

    let cancelled = false
    setLibraryEntryId(null)
    setIsResolving(true)
    getLibraryEntryByEpisodeId(currentEpisode.id)
      .then((result) => {
        if (!cancelled) {
          setLibraryEntryId(result?.libraryEntryId ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLibraryEntryId(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsResolving(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentEpisode?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
  }, [])

  const startDismissTimer = useCallback(() => {
    clearDismissTimer()
    dismissTimerRef.current = setTimeout(() => {
      setNoteOpen(false)
      setNoteText("")
      setLastBookmarkId(null)
    }, AUTO_DISMISS_MS)
  }, [clearDismissTimer])

  // Clean up timer on unmount
  useEffect(() => {
    return () => clearDismissTimer()
  }, [clearDismissTimer])

  const handleBookmark = () => {
    if (libraryEntryId === null) return

    const timestamp = Math.floor(currentTimeRef.current)

    startTransition(async () => {
      const result = await addBookmark(libraryEntryId, timestamp)
      if (result.success && result.bookmark) {
        toast.success(`Bookmarked at ${formatTime(timestamp)}`)
        setLastBookmarkId(result.bookmark.id)
        setNoteOpen(true)
        startDismissTimer()
        window.dispatchEvent(new CustomEvent("bookmark-changed"))
      } else {
        toast.error(result.error || "Failed to add bookmark")
      }
    })
  }

  const handleNoteSubmit = () => {
    const normalizedNote = noteText.normalize("NFKC").trim()
    if (!lastBookmarkId || !normalizedNote) return

    if (normalizedNote.length > MAX_NOTE_LENGTH) {
      toast.error(`Note is too long (max ${MAX_NOTE_LENGTH} characters)`)
      return
    }

    clearDismissTimer()
    startTransition(async () => {
      const result = await updateBookmark(lastBookmarkId, normalizedNote)
      if (result.success) {
        toast.success("Note saved")
        window.dispatchEvent(new CustomEvent("bookmark-changed"))
      } else {
        toast.error("Failed to save note")
      }
      setNoteOpen(false)
      setNoteText("")
      setLastBookmarkId(null)
    })
  }

  const handleNoteKeyDown = (e: React.KeyboardEvent) => {
    // Reset auto-dismiss timer on keystrokes
    startDismissTimer()
    if (e.key === "Enter") {
      e.preventDefault()
      handleNoteSubmit()
    }
  }

  // Hide button while resolving or if episode not in library
  if (isResolving || libraryEntryId === null) return null

  return (
    <Popover open={noteOpen} onOpenChange={(open) => {
      if (!open) {
        clearDismissTimer()
        setNoteOpen(false)
        setNoteText("")
        setLastBookmarkId(null)
      }
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBookmark}
          disabled={isPending}
          aria-label="Bookmark current position"
          className="h-8 w-8 shrink-0"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="w-64 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Add a note (optional)</p>
          <Input
            placeholder="Key insight mentioned here..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={handleNoteKeyDown}
            maxLength={MAX_NOTE_LENGTH}
            autoFocus
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleNoteSubmit}
              disabled={isPending || !noteText.trim()}
            >
              Save note
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
