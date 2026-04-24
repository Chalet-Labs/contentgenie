"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Rss } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PinnedSubscription } from "@/app/actions/subscriptions";
import { usePinnedSubscriptionsOptional } from "@/contexts/pinned-subscriptions-context";
import { MaybeSheetClose } from "@/components/layout/maybe-sheet-close";

function PinnedRssFallback() {
  return (
    <div
      className="flex h-5 w-5 items-center justify-center rounded bg-muted text-muted-foreground"
      data-testid="pinned-rss-fallback"
    >
      <Rss className="h-3 w-3" />
    </div>
  );
}

function PinnedArtwork({ imageUrl }: { imageUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);
  if (!imageUrl || failed) return <PinnedRssFallback />;
  return (
    <Image
      src={imageUrl}
      alt=""
      width={20}
      height={20}
      className="h-5 w-5 rounded object-cover"
      onError={() => setFailed(true)}
      unoptimized
    />
  );
}

function PinnedRow({
  pin,
  inSheet,
  pathname,
}: {
  pin: PinnedSubscription;
  inSheet: boolean;
  pathname: string | null;
}) {
  const href = `/podcast/${pin.podcastIndexId}`;
  const isActive = pathname === href;
  return (
    <li>
      <MaybeSheetClose inSheet={inSheet}>
        <Link
          href={href}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
            isActive
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <PinnedArtwork imageUrl={pin.imageUrl} />
          <span className="truncate">{pin.title}</span>
        </Link>
      </MaybeSheetClose>
    </li>
  );
}

export function PinnedSubscriptionsSection({ inSheet }: { inSheet: boolean }) {
  const { pinned } = usePinnedSubscriptionsOptional();
  const pathname = usePathname();

  if (pinned.length === 0) return null;

  return (
    <ul className="ml-6 mt-1 space-y-0.5" role="list">
      {pinned.map((pin) => (
        <PinnedRow
          key={pin.id}
          pin={pin}
          inSheet={inSheet}
          pathname={pathname}
        />
      ))}
    </ul>
  );
}
