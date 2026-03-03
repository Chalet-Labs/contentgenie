"use client"

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { ListMusic, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  useAudioPlayerState,
  useAudioPlayerAPI,
} from "@/contexts/audio-player-context"
import { useMediaQuery } from "@/hooks/use-media-query"
import { QueueItem } from "@/components/audio-player/queue-item"

function QueueList() {
  const { queue } = useAudioPlayerState()
  const { removeFromQueue, reorderQueue, clearQueue, playEpisode } =
    useAudioPlayerAPI()

  const mouseSensor = useSensor(MouseSensor)
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 },
  })
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  })
  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = queue.findIndex((ep) => ep.id === active.id)
    const newIndex = queue.findIndex((ep) => ep.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderQueue(oldIndex, newIndex)
    }
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ListMusic className="mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">
          Your queue is empty
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Add episodes from episode pages or cards
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Up Next</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {queue.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearQueue}
          className="h-7 text-xs text-muted-foreground"
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Clear all
        </Button>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={queue.map((ep) => ep.id)}
            strategy={verticalListSortingStrategy}
          >
            {queue.map((episode) => (
              <QueueItem
                key={episode.id}
                episode={episode}
                onRemove={() => removeFromQueue(episode.id)}
                onPlay={() => {
                  playEpisode(episode)
                  removeFromQueue(episode.id)
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}

interface QueuePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: React.ReactNode
}

export function QueuePanel({ open, onOpenChange, trigger }: QueuePanelProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)")

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={12}
          className="w-80 p-3"
        >
          <QueueList />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="h-[80vh]">
        <SheetHeader>
          <SheetTitle>Queue</SheetTitle>
          <SheetDescription className="sr-only">
            Manage your episode queue
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          <QueueList />
        </div>
      </SheetContent>
    </Sheet>
  )
}
