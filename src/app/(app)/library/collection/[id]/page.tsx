"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Bookmark, Pencil, Trash2, Loader2, Folder } from "lucide-react";
import { ShareButton } from "@/components/ui/share-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SavedEpisodeCard } from "@/components/library/saved-episode-card";
import { CollectionDialog } from "@/components/library/collection-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getCollection, deleteCollection } from "@/app/actions/collections";
import type { Episode, Podcast, UserLibraryEntry, Collection } from "@/db/schema";

type LibraryItem = UserLibraryEntry & {
  episode: Episode & {
    podcast: Podcast;
  };
  collection?: Collection | null;
};

export default function CollectionDetailPage() {
  const params = useParams();
  const collectionId = parseInt(params.id as string, 10);

  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCollection = useCallback(async () => {
    if (isNaN(collectionId)) {
      setError("Invalid collection ID");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await getCollection(collectionId);

    if (result.error) {
      setError(result.error);
    } else {
      setCollection(result.collection);
      // Add collection reference to items for display
      const itemsWithCollection = result.items.map((item) => ({
        ...item,
        collection: result.collection,
      }));
      setItems(itemsWithCollection as LibraryItem[]);
    }

    setIsLoading(false);
  }, [collectionId]);

  useEffect(() => {
    loadCollection();
  }, [loadCollection]);

  const handleRemoved = () => {
    loadCollection();
  };

  const handleCollectionChanged = () => {
    loadCollection();
  };

  const handleEditSuccess = () => {
    loadCollection();
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const collectionName = collection?.name;
    const result = await deleteCollection(collectionId);
    if (result.success) {
      toast.success("Collection deleted", {
        description: `"${collectionName}" has been deleted`,
      });
      // Redirect to library after deletion
      window.location.href = "/library";
    } else {
      toast.error("Failed to delete collection", {
        description: result.error || "Please try again",
      });
    }
    setIsDeleting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/library">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : collection ? (
            <div>
              <div className="flex items-center gap-2">
                <Folder className="h-6 w-6 text-muted-foreground" />
                <h1 className="text-3xl font-bold tracking-tight">{collection.name}</h1>
              </div>
              <p className="text-muted-foreground">
                {collection.description || `${items.length} episode${items.length === 1 ? "" : "s"}`}
              </p>
            </div>
          ) : null}
        </div>
        {!isLoading && collection && (
          <div className="flex items-center gap-2">
            {process.env.NEXT_PUBLIC_APP_URL && (
              <ShareButton
                title={collection.name}
                url={`${process.env.NEXT_PUBLIC_APP_URL}/library/collection/${collectionId}`}
                size="sm"
              />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditDialog(true)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Collection</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete &quot;{collection.name}&quot;? Episodes in this
                    collection will not be deleted from your library.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-4 rounded-lg border p-4">
              <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!isLoading && error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={loadCollection}
            className="mt-4"
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && collection && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-12 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <Bookmark className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">No episodes in this collection</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Add episodes to this collection from your library or by saving new episodes.
          </p>
          <Button asChild className="mt-6">
            <Link href="/library">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Library
            </Link>
          </Button>
        </div>
      )}

      {/* Episodes list */}
      {!isLoading && !error && items.length > 0 && (
        <div className="space-y-4">
          {items.map((item) => (
            <SavedEpisodeCard
              key={item.id}
              item={item}
              onRemoved={handleRemoved}
              onCollectionChanged={handleCollectionChanged}
            />
          ))}
        </div>
      )}

      {/* Edit dialog */}
      {collection && (
        <CollectionDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          collection={collection}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
