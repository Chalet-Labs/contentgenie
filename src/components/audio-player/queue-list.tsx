"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ListMusic, Trash2, Volume2, Rss } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  useAudioPlayerState,
  useAudioPlayerAPI,
} from "@/contexts/audio-player-context";
import { QueueItem } from "@/components/audio-player/queue-item";

const TOUCH_SENSOR_OPTIONS = {
  activationConstraint: { delay: 250, tolerance: 5 },
};

function NowPlaying() {
  const { currentEpisode } = useAudioPlayerState();

  if (!currentEpisode) return null;

  return (
    <div className="border-b pb-3">
      <div className="flex items-center gap-2 pb-2">
        <Volume2 className="h-3.5 w-3.5 text-primary" />
        <span className="text-sm font-medium">Now Playing</span>
      </div>
      <div className="flex items-center gap-2 rounded-md bg-primary/5 p-2">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-muted">
          {currentEpisode.artwork ? (
            <Image
              src={currentEpisode.artwork}
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
          <p
            className="truncate text-sm font-medium"
            title={currentEpisode.title}
          >
            {currentEpisode.title}
          </p>
          <p
            className="truncate text-xs text-muted-foreground"
            title={currentEpisode.podcastTitle}
          >
            {currentEpisode.podcastTitle}
          </p>
        </div>
      </div>
    </div>
  );
}

interface QueueListProps {
  /**
   * Optional max-height for the scrollable list area (e.g. "50vh").
   * When omitted, the list flows naturally — used by the dashboard card
   * which sizes itself inside the page grid.
   */
  maxHeight?: string;
}

export function QueueList({ maxHeight }: QueueListProps = {}) {
  const { queue } = useAudioPlayerState();
  const { removeFromQueue, reorderQueue, clearQueue, playEpisode } =
    useAudioPlayerAPI();

  const mouseSensor = useSensor(MouseSensor);
  const touchSensor = useSensor(TouchSensor, TOUCH_SENSOR_OPTIONS);
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = queue.findIndex((ep) => ep.id === active.id);
    const newIndex = queue.findIndex((ep) => ep.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderQueue(oldIndex, newIndex);
    }
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col">
        <NowPlaying />
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 rounded-full bg-muted p-3">
            <ListMusic className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            Your queue is empty
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Add episodes from episode pages or cards
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <NowPlaying />
      <div className="flex items-center justify-between pb-2 pt-3">
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
      <div
        className={maxHeight ? "overflow-y-auto" : undefined}
        style={maxHeight ? { maxHeight } : undefined}
      >
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
                  playEpisode(episode);
                  removeFromQueue(episode.id);
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
