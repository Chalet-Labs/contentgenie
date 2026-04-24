"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Rss } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePinnedSubscriptionsOptional } from "@/contexts/pinned-subscriptions-context";
import { MaybeSheetClose } from "@/components/layout/sidebar";

export function PinnedSubscriptionsSection({ inSheet }: { inSheet: boolean }) {
  const { pinned } = usePinnedSubscriptionsOptional();
  const pathname = usePathname();

  if (pinned.length === 0) return null;

  return (
    <ul className="ml-6 mt-1 space-y-0.5" role="list">
      {pinned.map((p) => {
        const isActive = pathname === `/podcast/${p.podcastIndexId}`;
        return (
          <li key={p.id}>
            <MaybeSheetClose inSheet={inSheet}>
              <Link
                href={`/podcast/${p.podcastIndexId}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {p.imageUrl ? (
                  // Tiny sidebar icon, remote podcast artwork URLs — next/image adds no perf benefit here
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-5 w-5 rounded object-cover"
                  />
                ) : (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded bg-muted text-muted-foreground"
                    data-testid="pinned-rss-fallback"
                  >
                    <Rss className="h-3 w-3" />
                  </div>
                )}
                <span className="truncate">{p.title}</span>
              </Link>
            </MaybeSheetClose>
          </li>
        );
      })}
    </ul>
  );
}
