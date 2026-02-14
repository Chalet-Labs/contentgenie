"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
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
  Rss,
  Trash2,
  Loader2,
  Folder,
  ChevronDown,
  ChevronUp,
  StickyNote,
  Star,
} from "lucide-react";
import { removeEpisodeFromLibrary, updateLibraryRating } from "@/app/actions/library";
import { MoveToCollection } from "./move-to-collection";
import { NotesEditor } from "./notes-editor";
import { BookmarksList } from "./bookmarks-list";
import { RatingInput } from "@/components/episodes/rating-input";
import { stripHtml, formatDate, formatDuration } from "@/lib/utils";
import type { Episode, Podcast, UserLibraryEntry, Collection } from "@/db/schema";

interface SavedEpisodeCardProps {
  item: UserLibraryEntry & {
    episode: Episode & {
      podcast: Podcast;
    };
    collection?: Collection | null;
  };
  onRemoved?: () => void;
  onCollectionChanged?: () => void;
}


export function SavedEpisodeCard({ item, onRemoved, onCollectionChanged }: SavedEpisodeCardProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(false);
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

  const worthItScore = episode.worthItScore ? parseFloat(episode.worthItScore) : null;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Podcast artwork */}
            <Link
              href={`/episode/${episode.podcastIndexId}`}
              className="shrink-0"
            >
              <div className="relative h-20 w-20 overflow-hidden rounded-lg bg-muted">
                {podcast.imageUrl ? (
                  <Image
                    src={podcast.imageUrl}
                    alt={podcast.title}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Rss className="h-8 w-8" />
                  </div>
                )}
              </div>
            </Link>

            {/* Episode info */}
            <div className="min-w-0 flex-1">
              <Link href={`/episode/${episode.podcastIndexId}`}>
                <h3 className="line-clamp-1 font-semibold hover:text-primary">
                  {episode.title}
                </h3>
              </Link>
              <Link
                href={`/podcast/${podcast.podcastIndexId}?from=library`}
                className="text-sm text-muted-foreground hover:text-primary"
              >
                {podcast.title}
              </Link>

              {episode.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {stripHtml(episode.description)}
                </p>
              )}

              {/* Metadata row */}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {episode.publishDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(episode.publishDate)}</span>
                  </div>
                )}
                {episode.duration && episode.duration > 0 && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatDuration(episode.duration)}</span>
                  </div>
                )}
                {worthItScore !== null && (
                  <Badge
                    variant={worthItScore >= 7 ? "default" : worthItScore >= 5 ? "secondary" : "outline"}
                    className="text-xs"
                  >
                    Worth it: {worthItScore.toFixed(1)}/10
                  </Badge>
                )}
                {hasNotes && (
                  <div className="flex items-center gap-1 text-primary">
                    <StickyNote className="h-3 w-3" />
                    <span>Has notes</span>
                  </div>
                )}
                {item.rating && (
                  <div className="flex items-center gap-1 text-yellow-500">
                    <Star className="h-3 w-3 fill-current" />
                    <span>{item.rating}/5</span>
                  </div>
                )}
              </div>

              {/* Saved date, collection, and actions */}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Saved {formatDate(item.savedAt)}</span>
                  {collection && (
                    <Badge variant="outline" className="text-xs">
                      <Folder className="mr-1 h-3 w-3" />
                      {collection.name}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
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
                      <span className="ml-1 text-xs">
                        {isExpanded ? "Less" : "More"}
                      </span>
                    </Button>
                  </CollapsibleTrigger>
                  <MoveToCollection
                    libraryEntryId={item.id}
                    currentCollectionId={item.collectionId}
                    onMoved={onCollectionChanged}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemove}
                    disabled={isPending || isRemoving}
                    className="h-8 px-2 text-muted-foreground hover:text-destructive"
                  >
                    {isPending || isRemoving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Expandable notes, rating, and bookmarks section */}
          <CollapsibleContent>
            <div className="mt-4 space-y-4 border-t pt-4">
              {/* Your Rating */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Your Rating</h4>
                <RatingInput
                  initialRating={item.rating}
                  onRatingChange={async (rating) => {
                    return await updateLibraryRating(episode.podcastIndexId, rating);
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
              />
            </div>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}
