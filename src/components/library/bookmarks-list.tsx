"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { Clock, Trash2, Plus, Loader2, Bookmark } from "lucide-react";
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
  addBookmark,
  deleteBookmark,
  getBookmarks,
} from "@/app/actions/library";
import type { Bookmark as BookmarkType } from "@/db/schema";

interface BookmarksListProps {
  libraryEntryId: number;
  episodeDuration?: number | null;
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
  const parts = input.split(":").map((p) => parseInt(p, 10));

  if (parts.some(isNaN)) return null;

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  } else if (parts.length === 1) {
    return parts[0];
  }

  return null;
}

export function BookmarksList({
  libraryEntryId,
  episodeDuration,
}: BookmarksListProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTimestamp, setNewTimestamp] = useState("");
  const [newNote, setNewNote] = useState("");
  const [isPending, startTransition] = useTransition();

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

  const handleAddBookmark = () => {
    const timestamp = parseTimestamp(newTimestamp);
    if (timestamp === null) {
      setError("Invalid timestamp format. Use MM:SS or HH:MM:SS");
      return;
    }

    if (episodeDuration && timestamp > episodeDuration) {
      setError("Timestamp exceeds episode duration");
      return;
    }

    startTransition(async () => {
      const result = await addBookmark(
        libraryEntryId,
        timestamp,
        newNote || undefined
      );

      if (result.success) {
        setNewTimestamp("");
        setNewNote("");
        setIsDialogOpen(false);
        loadBookmarks();
        toast.success("Bookmark added", {
          description: `Bookmark at ${formatTimestamp(timestamp)} created`,
        });
      } else {
        setError(result.error || "Failed to add bookmark");
      }
    });
  };

  const handleDeleteBookmark = (bookmarkId: number) => {
    startTransition(async () => {
      const result = await deleteBookmark(bookmarkId);
      if (result.success) {
        loadBookmarks();
        toast.success("Bookmark deleted");
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
        <label className="flex items-center gap-2 text-sm font-medium">
          <Bookmark className="h-4 w-4" />
          Bookmarks
        </label>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-3 w-3" />
              Add Bookmark
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Bookmark</DialogTitle>
              <DialogDescription>
                Add a timestamp bookmark with an optional note.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Timestamp{" "}
                  <span className="text-xs text-muted-foreground">
                    (MM:SS or HH:MM:SS)
                  </span>
                </label>
                <Input
                  placeholder="12:30"
                  value={newTimestamp}
                  onChange={(e) => {
                    setNewTimestamp(e.target.value);
                    setError(null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Note{" "}
                  <span className="text-xs text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <Input
                  placeholder="Key insight mentioned here..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddBookmark} disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add Bookmark
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {bookmarks.length === 0 ? (
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
              <div className="flex shrink-0 items-center gap-1 rounded bg-muted px-2 py-1 text-sm font-mono">
                <Clock className="h-3 w-3" />
                {formatTimestamp(bookmark.timestamp)}
              </div>
              <div className="min-w-0 flex-1">
                {bookmark.note ? (
                  <p className="text-sm">{bookmark.note}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
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
