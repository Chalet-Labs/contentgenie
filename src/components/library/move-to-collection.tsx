"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { FolderPlus, FolderInput, Check, Plus, Loader2 } from "lucide-react";
import { getUserCollections, moveEpisodeToCollection } from "@/app/actions/collections";
import { CollectionDialog } from "./collection-dialog";
import type { Collection } from "@/db/schema";

interface MoveToCollectionProps {
  libraryEntryId: number;
  currentCollectionId: number | null;
  onMoved?: () => void;
}

type CollectionWithCount = Collection & { episodeCount: number };

export function MoveToCollection({
  libraryEntryId,
  currentCollectionId,
  onMoved,
}: MoveToCollectionProps) {
  const [collections, setCollections] = useState<CollectionWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const loadCollections = async () => {
    setIsLoading(true);
    const result = await getUserCollections();
    setCollections(result.collections as CollectionWithCount[]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadCollections();
  }, []);

  const handleMove = (collectionId: number | null, collectionName?: string) => {
    if (collectionId === currentCollectionId) return;

    startTransition(async () => {
      const result = await moveEpisodeToCollection(libraryEntryId, collectionId);
      if (result.success) {
        onMoved?.();
        if (collectionId === null) {
          toast.success("Removed from collection");
        } else {
          toast.success("Moved to collection", {
            description: `Episode moved to "${collectionName}"`,
          });
        }
      } else {
        toast.error("Failed to move episode", {
          description: result.error || "Please try again",
        });
      }
    });
  };

  const handleCreateSuccess = () => {
    loadCollections();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : currentCollectionId ? (
              <FolderInput className="h-4 w-4" />
            ) : (
              <FolderPlus className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Move to Collection</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Remove from collection option */}
              {currentCollectionId !== null && (
                <>
                  <DropdownMenuItem onClick={() => handleMove(null, undefined)}>
                    <span className="text-muted-foreground">No collection</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* List collections */}
              {collections.length === 0 ? (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  No collections yet
                </div>
              ) : (
                collections.map((collection) => (
                  <DropdownMenuItem
                    key={collection.id}
                    onClick={() => handleMove(collection.id, collection.name)}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate">{collection.name}</span>
                    {collection.id === currentCollectionId && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create New Collection
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CollectionDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={handleCreateSuccess}
      />
    </>
  );
}
