"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { removeAlias } from "@/app/actions/topics";

interface AliasesPanelProps {
  canonicalId: number;
  aliases: { id: number; alias: string }[];
}

export function AliasesPanel({ canonicalId, aliases }: AliasesPanelProps) {
  const router = useRouter();
  const [pending, setPending] = useState<number | null>(null);

  async function handleRemove(aliasId: number) {
    setPending(aliasId);
    try {
      const result = await removeAlias({ canonicalId, aliasId });
      if (result.success) {
        toast.success("Alias removed.");
        router.refresh();
      } else {
        toast.error(`Remove failed: ${result.error}`);
      }
    } catch (err) {
      toast.error(
        `Remove failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setPending(null);
    }
  }

  if (aliases.length === 0) {
    return <p className="text-sm text-muted-foreground">No aliases.</p>;
  }

  return (
    <ul className="space-y-1">
      {aliases.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-2">
          <span className="text-sm">{a.alias}</span>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending === a.id}
                aria-disabled={pending === a.id}
              >
                {pending === a.id ? "Removing…" : "Remove"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove alias?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the alias &quot;{a.alias}&quot;.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleRemove(a.id)}>
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </li>
      ))}
    </ul>
  );
}
