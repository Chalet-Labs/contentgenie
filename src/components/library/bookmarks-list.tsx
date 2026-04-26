"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Clock, Trash2, Plus, Loader2, Bookmark } from "lucide-react";
import { MAX_SHORT_TEXT } from "@/lib/schemas/library";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  addBookmark,
  deleteBookmark,
  getBookmarks,
} from "@/app/actions/library";
import {
  useAudioPlayerState,
  useAudioPlayerAPI,
  type AudioEpisode,
} from "@/contexts/audio-player-context";
import type { Bookmark as BookmarkType } from "@/db/schema";
import { BOOKMARK_CHANGED_EVENT } from "@/lib/events";
import type { PodcastIndexEpisodeId } from "@/types/ids";

interface BookmarksListProps {
  libraryEntryId: number;
  episodeDuration?: number | null;
  episodeAudioData?: {
    podcastIndexId: PodcastIndexEpisodeId;
    title: string;
    podcastTitle: string;
    audioUrl: string;
    artwork?: string;
    duration?: number;
    chaptersUrl?: string;
  };
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function parseTimestamp(input: string): number | null {
  const parts = input.split(":");

  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some((part) => !/^\d+$/.test(part))) return null;

  const nums = parts.map(Number);

  if (parts.length === 3) {
    const [hours, minutes, seconds] = nums;
    if (parts[1].length !== 2 || parts[2].length !== 2) return null;
    if (minutes >= 60 || seconds >= 60) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  const [minutes, seconds] = nums;
  if (parts[1].length !== 2) return null;
  if (seconds >= 60) return null;
  return minutes * 60 + seconds;
}

const bookmarkSchema = z.object({
  timestamp: z
    .string()
    .trim()
    .min(1, "Timestamp is required")
    .refine(
      (val) => parseTimestamp(val) !== null,
      "Invalid format. Use MM:SS or HH:MM:SS",
    ),
  note: z.string().max(MAX_SHORT_TEXT).optional(),
});
type BookmarkValues = z.infer<typeof bookmarkSchema>;

export function BookmarksList({
  libraryEntryId,
  episodeDuration,
  episodeAudioData,
}: BookmarksListProps) {
  const { currentEpisode, isPlaying } = useAudioPlayerState();
  const api = useAudioPlayerAPI();
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<BookmarkValues>({
    resolver: zodResolver(bookmarkSchema),
    defaultValues: { timestamp: "", note: "" },
  });
  const { reset } = form;

  useEffect(() => {
    if (!isDialogOpen) reset();
  }, [isDialogOpen, reset]);

  const loadBookmarks = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await getBookmarks(libraryEntryId);

    if (result.error) {
      setError(result.error);
    } else {
      setBookmarks(result.bookmarks);
    }

    setIsLoading(false);
  }, [libraryEntryId]);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const onSubmit = async (values: BookmarkValues) => {
    const timestamp = parseTimestamp(values.timestamp)!;

    if (episodeDuration && timestamp > episodeDuration) {
      form.setError("timestamp", {
        message: "Timestamp exceeds episode duration",
      });
      return;
    }

    const note = values.note?.trim();
    const result = await addBookmark(
      libraryEntryId,
      timestamp,
      note || undefined,
    );

    if (result.success) {
      form.reset();
      setIsDialogOpen(false);
      loadBookmarks();
      window.dispatchEvent(new CustomEvent(BOOKMARK_CHANGED_EVENT));
      toast.success("Bookmark added", {
        description: `Bookmark at ${formatTimestamp(timestamp)} created`,
      });
    } else {
      form.setError("root", {
        message: result.error || "Failed to add bookmark",
      });
    }
  };

  const handleSeekToBookmark = (timestamp: number) => {
    if (!episodeAudioData) return;
    if (currentEpisode?.id === episodeAudioData.podcastIndexId) {
      api.seek(timestamp);
      if (!isPlaying) {
        api.togglePlay();
      }
    } else {
      const episode: AudioEpisode = {
        id: episodeAudioData.podcastIndexId,
        title: episodeAudioData.title,
        podcastTitle: episodeAudioData.podcastTitle,
        audioUrl: episodeAudioData.audioUrl,
        artwork: episodeAudioData.artwork,
        duration: episodeAudioData.duration,
        chaptersUrl: episodeAudioData.chaptersUrl,
      };
      api.playEpisode(episode, { startAt: timestamp });
    }
  };

  const handleDeleteBookmark = (bookmarkId: number) => {
    startTransition(async () => {
      const result = await deleteBookmark(bookmarkId);
      if (result.success) {
        loadBookmarks();
        toast.success("Bookmark deleted");
        window.dispatchEvent(new CustomEvent(BOOKMARK_CHANGED_EVENT));
      } else {
        toast.error("Failed to delete bookmark");
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Bookmark className="h-4 w-4" />
          Bookmarks
        </span>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(nextOpen) => {
            if (form.formState.isSubmitting) return;
            setIsDialogOpen(nextOpen);
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-3 w-3" />
              Add Bookmark
            </Button>
          </DialogTrigger>
          <DialogContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <DialogHeader>
                  <DialogTitle>Add Bookmark</DialogTitle>
                  <DialogDescription>
                    Add a timestamp bookmark with an optional note.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <FormField
                    control={form.control}
                    name="timestamp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Timestamp{" "}
                          <span className="text-xs text-muted-foreground">
                            (MM:SS or HH:MM:SS)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="12:30" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Note{" "}
                          <span className="text-xs text-muted-foreground">
                            (optional)
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Key insight mentioned here..."
                            maxLength={MAX_SHORT_TEXT}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {form.formState.errors.root?.message && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.root.message}
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={form.formState.isSubmitting}
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Add Bookmark
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : bookmarks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No bookmarks yet. Add timestamps to mark important moments.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {bookmarks.map((bookmark) => (
            <div
              key={bookmark.id}
              className="group flex items-start gap-3 rounded-lg border bg-card p-3"
            >
              {episodeAudioData ? (
                <button
                  type="button"
                  onClick={() => handleSeekToBookmark(bookmark.timestamp)}
                  aria-label={`Seek to ${formatTimestamp(bookmark.timestamp)}`}
                  className="flex shrink-0 cursor-pointer items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-sm transition-colors hover:bg-primary/20"
                >
                  <Clock className="h-3 w-3" />
                  {formatTimestamp(bookmark.timestamp)}
                </button>
              ) : (
                <div className="flex shrink-0 items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-sm">
                  <Clock className="h-3 w-3" />
                  {formatTimestamp(bookmark.timestamp)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {bookmark.note ? (
                  <p className="text-sm">{bookmark.note}</p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    No note
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteBookmark(bookmark.id)}
                disabled={isPending}
                className="h-8 shrink-0 px-2 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
