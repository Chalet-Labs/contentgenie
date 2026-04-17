"use client";

import { useState, useEffect, useCallback } from "react";
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

// SheetClose relies on Radix Dialog context and throws outside of one. Since
// SidebarNav renders in both the mobile Sheet and the desktop aside, the mobile
// path passes SheetCloseWrapper to auto-dismiss on nav tap while the desktop
// path gets the identity wrapper.
type LinkWrapperProps = { children: React.ReactElement };
type LinkWrapperComponent = React.ComponentType<LinkWrapperProps>;

const IdentityWrapper: LinkWrapperComponent = ({ children }) => children;

const SheetCloseWrapper: LinkWrapperComponent = ({ children }) => (
  <SheetClose asChild>{children}</SheetClose>
);

function SidebarNav({
  pathname,
  collections,
  isLoading,
  onCreateClick,
  LinkWrapper = IdentityWrapper,
}: {
  pathname: string;
  collections: CollectionWithCount[];
  isLoading: boolean;
  onCreateClick: () => void;
  LinkWrapper?: LinkWrapperComponent;
}) {
  return (
    <nav className="space-y-1">
      <LinkWrapper>
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
      </LinkWrapper>

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
        ) : collections.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            No collections yet. Create one to organize your episodes.
          </p>
        ) : (
          <div className="space-y-1">
            {collections.map((collection) => (
              <LinkWrapper key={collection.id}>
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
              </LinkWrapper>
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
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const loadCollections = useCallback(async () => {
    setIsLoading(true);
    const result = await getUserCollections();
    setCollections(result.collections as CollectionWithCount[]);
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
      {/* Mobile: Sheet trigger */}
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
                onCreateClick={() => setShowCreateDialog(true)}
                LinkWrapper={SheetCloseWrapper}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: inline sidebar */}
      <aside className="hidden md:block w-64 shrink-0 border-r pr-6">
        <SidebarNav
          pathname={pathname}
          collections={collections}
          isLoading={isLoading}
          onCreateClick={() => setShowCreateDialog(true)}
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
