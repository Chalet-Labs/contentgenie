"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { createCollection, updateCollection } from "@/app/actions/collections";
import type { Collection } from "@/db/schema";

interface CollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection?: Collection | null; // If provided, we're editing
  onSuccess?: () => void;
}

export function CollectionDialog({
  open,
  onOpenChange,
  collection,
  onSuccess,
}: CollectionDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEditing = !!collection;

  // Reset form when dialog opens or collection changes
  useEffect(() => {
    if (open) {
      setName(collection?.name || "");
      setDescription(collection?.description || "");
      setError(null);
    }
  }, [open, collection]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Collection name is required");
      return;
    }

    startTransition(async () => {
      const result = isEditing
        ? await updateCollection(collection.id, name, description)
        : await createCollection(name, description);

      if (result.success) {
        onOpenChange(false);
        onSuccess?.();
      } else {
        setError(result.error || "An error occurred");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Collection" : "Create Collection"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update your collection details."
                : "Create a new collection to organize your saved episodes."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Tech News, Must Listen"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
                <span className="text-muted-foreground font-normal">
                  {" "}
                  (optional)
                </span>
              </label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief description of this collection"
                disabled={isPending}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Collection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
