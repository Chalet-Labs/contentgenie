"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import Image from "next/image"
import { GripVertical, X, Rss } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AudioEpisode } from "@/contexts/audio-player-context"

interface QueueItemProps {
  episode: AudioEpisode
  onRemove: () => void
  onPlay: () => void
}

export function QueueItem({ episode, onRemove, onPlay }: QueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: episode.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md p-2 ${
        isDragging ? "z-10 bg-accent opacity-80 shadow-md" : "hover:bg-accent/50"
      }`}
    >
      <button
        className="flex shrink-0 cursor-grab touch-none items-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onPlay}
        aria-label={`Play ${episode.title}`}
      >
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-muted">
          {episode.artwork ? (
            <Image
              src={episode.artwork}
              alt=""
              fill
              className="object-cover"
              sizes="36px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Rss className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={episode.title}>
            {episode.title}
          </p>
          <p
            className="truncate text-xs text-muted-foreground"
            title={episode.podcastTitle}
          >
            {episode.podcastTitle}
          </p>
        </div>
      </button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label={`Remove ${episode.title} from queue`}
        className="h-7 w-7 shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
