"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Folder, Plus, Bookmark, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { CollectionDialog } from "./collection-dialog";
import { getUserCollections } from "@/app/actions/collections";
import type { Collection } from "@/db/schema";
import { cn } from "@/lib/utils";

type CollectionWithCount = Collection & { episodeCount: number };

function SidebarNav({
  pathname,
  collections,
  isLoading,
  loadError,
  onCreateClick,
  inSheet,
}: {
  pathname: string;
  collections: CollectionWithCount[];
  isLoading: boolean;
  loadError: string | null;
  onCreateClick: () => void;
  inSheet: boolean;
}) {
  // SheetClose is Radix DialogPrimitive.Close — it throws outside a Sheet/Dialog
  // context. This component renders in both the mobile Sheet and the desktop
  // aside, so only the mobile path opts into SheetClose wrapping.
  const wrap = (link: React.ReactElement) =>
    inSheet ? <SheetClose asChild>{link}</SheetClose> : link;

  return (
    <nav className="space-y-1">
      {wrap(
        <Link
          href="/library"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent",
            pathname === "/library" && "bg-accent font-medium"
          )}
        >
          <Bookmark className="h-4 w-4" />
          All Saved
        </Link>
      )}

      <div className="pt-4">
        <div className="mb-2 flex items-center justify-between px-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Collections
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onCreateClick}
            aria-label="New collection"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <p role="alert" className="px-3 py-2 text-xs text-destructive">
            {loadError}
          </p>
        ) : collections.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No collections yet. Create one to organize your episodes.
          </p>
        ) : (
          <div className="space-y-1">
            {collections.map((collection) => (
              <Fragment key={collection.id}>
                {wrap(
                  <Link
                    href={`/library/collection/${collection.id}`}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent",
                      pathname === `/library/collection/${collection.id}` &&
                        "bg-accent font-medium"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Folder className="h-4 w-4 shrink-0" />
                      <span className="truncate">{collection.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {collection.episodeCount}
                    </span>
                  </Link>
                )}
              </Fragment>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

export function LibrarySidebar() {
  const pathname = usePathname();
  const [collections, setCollections] = useState<CollectionWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const handleCreateClick = useCallback(() => {
    setShowCreateDialog(true);
  }, []);

  const loadCollections = useCallback(async () => {
    setIsLoading(true);
    const result = await getUserCollections();
    if (result.error) {
      setLoadError(result.error);
      setCollections([]);
    } else {
      setLoadError(null);
      setCollections(result.collections);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  const handleCreateSuccess = () => {
    loadCollections();
  };

  return (
    <>
      <div className="md:hidden mb-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Library className="h-4 w-4" />
              Collections
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px]">
            <div className="mt-6">
              <SidebarNav
                pathname={pathname}
                collections={collections}
                isLoading={isLoading}
                loadError={loadError}
                onCreateClick={handleCreateClick}
                inSheet
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <aside className="hidden md:block w-64 shrink-0 border-r pr-6">
        <SidebarNav
          pathname={pathname}
          collections={collections}
          isLoading={isLoading}
          loadError={loadError}
          onCreateClick={() => setShowCreateDialog(true)}
          inSheet={false}
        />
      </aside>

      <CollectionDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={handleCreateSuccess}
      />
    </>
  );
}
