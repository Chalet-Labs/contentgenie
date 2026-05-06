"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Clock,
  Calendar,
  Trash2,
  Loader2,
  Folder,
  ChevronDown,
  ChevronUp,
  StickyNote,
  Star,
} from "lucide-react";
import {
  removeEpisodeFromLibrary,
  updateLibraryRating,
} from "@/app/actions/library";
import { useSidebarCountsOptional } from "@/contexts/sidebar-counts-context";
import { ListenedButton } from "@/components/episodes/listened-button";
import { EpisodeCard } from "@/components/episodes/episode-card";
import { MoveToCollection } from "./move-to-collection";
import { NotesEditor } from "./notes-editor";
import { BookmarksList } from "./bookmarks-list";
import { RatingInput } from "@/components/episodes/rating-input";
import { stripHtml, formatDate, formatDuration } from "@/lib/utils";
import type { SavedItemDTO } from "@/db/library-columns";
import type { CanonicalOverlapResult } from "@/lib/topic-overlap";

interface SavedEpisodeCardProps {
  item: SavedItemDTO;
  onRemoved?: () => void;
  onCollectionChanged?: () => void;
  isOffline?: boolean;
  isListened?: boolean;
  canonicalOverlap?: CanonicalOverlapResult | null;
}

export function SavedEpisodeCard({
  item,
  onRemoved,
  onCollectionChanged,
  isOffline,
  isListened = false,
  canonicalOverlap,
}: SavedEpisodeCardProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(false);
  const { refreshCounts } = useSidebarCountsOptional();
  const { episode, collection } = item;
  const hasNotes = item.notes && item.notes.trim().length > 0;
  const { podcast } = episode;

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsRemoving(true);
    startTransition(async () => {
      const result = await removeEpisodeFromLibrary(episode.podcastIndexId);
      if (result.success) {
        onRemoved?.();
        refreshCounts();
        toast.success("Removed from library", {
          description: `"${episode.title}" has been removed`,
        });
      } else {
        toast.error("Failed to remove", {
          description: result.error || "Please try again",
        });
      }
      setIsRemoving(false);
    });
  };

  const meta = [
    ...(episode.publishDate
      ? [
          <div key="date" className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(episode.publishDate)}</span>
          </div>,
        ]
      : []),
    ...(episode.duration && episode.duration > 0
      ? [
          <div key="duration" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(episode.duration)}</span>
          </div>,
        ]
      : []),
    ...(hasNotes
      ? [
          <div key="notes" className="flex items-center gap-1 text-primary">
            <StickyNote className="h-3 w-3" />
            <span>Has notes</span>
          </div>,
        ]
      : []),
    ...(item.rating
      ? [
          <div key="rating" className="flex items-center gap-1 text-brand">
            <Star className="h-3 w-3 fill-current" />
            <span>{item.rating}/5</span>
          </div>,
        ]
      : []),
    <span key="saved">Saved {formatDate(item.savedAt)}</span>,
    ...(collection
      ? [
          <Badge key="collection" variant="outline" className="text-xs">
            <Folder className="mr-1 h-3 w-3" />
            {collection.name}
          </Badge>,
        ]
      : []),
  ];

  const secondaryActions = (
    <>
      {!isOffline && (
        <ListenedButton
          podcastIndexEpisodeId={episode.podcastIndexId}
          isListened={isListened}
        />
      )}
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground"
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          <span className="ml-1 text-xs">{isExpanded ? "Less" : "More"}</span>
        </Button>
      </CollapsibleTrigger>
      {!isOffline && (
        <MoveToCollection
          libraryEntryId={item.id}
          currentCollectionId={item.collectionId}
          onMoved={onCollectionChanged}
        />
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRemove}
        disabled={isPending || isRemoving || isOffline}
        className="h-8 px-2 text-muted-foreground hover:text-destructive"
        title={isOffline ? "Unavailable offline" : undefined}
      >
        {isPending || isRemoving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </>
  );

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <EpisodeCard
        artwork={podcast.imageUrl}
        podcastTitle={podcast.title}
        podcastHref={`/podcast/${podcast.podcastIndexId}?from=library`}
        title={episode.title}
        href={`/episode/${episode.podcastIndexId}`}
        description={
          episode.description ? stripHtml(episode.description) : undefined
        }
        score={episode.worthItScore}
        canonicalTopics={episode.canonicalTopics}
        canonicalOverlap={canonicalOverlap}
        meta={meta}
        secondaryActions={secondaryActions}
        accent="none"
        isListened={isListened}
      />
      <CollapsibleContent>
        <div className="mt-1 space-y-4 rounded-b-lg border border-t-0 p-4">
          {!isOffline && (
            <>
              <div>
                <h4 className="mb-2 text-sm font-medium">Your Rating</h4>
                <RatingInput
                  initialRating={item.rating}
                  onRatingChange={async (rating) => {
                    return await updateLibraryRating(
                      episode.podcastIndexId,
                      rating,
                    );
                  }}
                  size="md"
                  showLabel={true}
                />
              </div>
              <NotesEditor
                episodePodcastIndexId={episode.podcastIndexId}
                initialNotes={item.notes || ""}
              />
              <BookmarksList
                libraryEntryId={item.id}
                episodeDuration={episode.duration}
                episodeAudioData={
                  episode.audioUrl
                    ? {
                        podcastIndexId: episode.podcastIndexId,
                        title: episode.title,
                        podcastTitle: podcast.title,
                        audioUrl: episode.audioUrl,
                        artwork: podcast.imageUrl || undefined,
                        duration: episode.duration || undefined,
                      }
                    : undefined
                }
              />
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
