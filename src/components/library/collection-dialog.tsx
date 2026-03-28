"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { createCollection, updateCollection } from "@/app/actions/collections";
import type { Collection } from "@/db/schema";

const collectionSchema = z.object({
  name: z.string().trim().min(1, "Collection name is required").max(255),
  description: z.string().max(500).optional(),
});
type CollectionValues = z.infer<typeof collectionSchema>;

interface CollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection?: Collection | null;
  onSuccess?: () => void;
}

export function CollectionDialog({
  open,
  onOpenChange,
  collection,
  onSuccess,
}: CollectionDialogProps) {
  const form = useForm<CollectionValues>({
    resolver: zodResolver(collectionSchema),
    defaultValues: { name: "", description: "" },
  });
  const { reset } = form;

  const isEditing = !!collection;

  useEffect(() => {
    if (open) {
      reset({
        name: collection?.name ?? "",
        description: collection?.description ?? "",
      });
    }
  }, [open, collection, reset]);

  const onSubmit = async (values: CollectionValues) => {
    const result = isEditing
      ? await updateCollection(collection.id, values.name, values.description ?? "")
      : await createCollection(values.name, values.description ?? "");

    if (result.success) {
      onOpenChange(false);
      onSuccess?.();
      toast.success(isEditing ? "Collection updated" : "Collection created", {
        description: isEditing
          ? `"${values.name}" has been updated`
          : `"${values.name}" has been created`,
      });
    } else {
      form.setError("root", { message: result.error || "An error occurred" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
        if (form.formState.isSubmitting) return;
        onOpenChange(nextOpen);
      }}>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
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
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Tech News, Must Listen"
                        disabled={form.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Description
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        (optional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="A brief description of this collection"
                        disabled={form.formState.isSubmitting}
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
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing ? "Save Changes" : "Create Collection"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
