"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubscriptionCard } from "./subscription-card";
import {
  setSubscriptionSort,
  togglePinSubscription,
  type SubscriptionWithPodcast,
} from "@/app/actions/subscriptions";
import { SUBSCRIPTION_SORTS, type SubscriptionSort } from "@/db/subscription-sorts";

interface SubscriptionsListProps {
  subscriptions: SubscriptionWithPodcast[];
  initialSort: SubscriptionSort;
}

const SORT_LABELS: Record<SubscriptionSort, string> = {
  "recently-added": "Recently added",
  "title-asc": "Title (A–Z)",
  "latest-episode": "Latest episode",
  "recently-listened": "Recently listened",
};

export function SubscriptionsList({
  subscriptions,
  initialSort,
}: SubscriptionsListProps) {
  const router = useRouter();
  const [sort, setSort] = useState<SubscriptionSort>(initialSort);
  const [pinOverrides, setPinOverrides] = useState<Record<number, boolean>>({});
  const [pinPendingIds, setPinPendingIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [isSortPending, startSortTransition] = useTransition();
  const [, startPinTransition] = useTransition();

  // Covers the window between a successful pin action resolving and the
  // `router.refresh()` RSC payload arriving: keep overrides that still
  // disagree with the prop, drop the ones the server has caught up on.
  useEffect(() => {
    setPinOverrides((prev) => {
      let changed = false;
      const next: Record<number, boolean> = {};
      for (const sub of subscriptions) {
        if (Object.hasOwn(prev, sub.id)) {
          if (prev[sub.id] === sub.isPinned) {
            changed = true;
            continue;
          }
          next[sub.id] = prev[sub.id];
        }
      }
      return changed ? next : prev;
    });
  }, [subscriptions]);

  const handleSortChange = (next: string) => {
    if (!SUBSCRIPTION_SORTS.includes(next as SubscriptionSort)) {
      console.warn("[SubscriptionsList] ignoring unknown sort", next);
      return;
    }
    const nextSort = next as SubscriptionSort;
    const prev = sort;
    setSort(nextSort);
    startSortTransition(async () => {
      try {
        const result = await setSubscriptionSort(nextSort);
        if (!result.success) {
          setSort(prev);
          toast.error(result.error ?? "Failed to update sort");
          return;
        }
        router.refresh();
      } catch (error) {
        console.error("[SubscriptionsList] setSubscriptionSort threw", error);
        setSort(prev);
        toast.error("Couldn't update sort. Check your connection and retry.");
      }
    });
  };

  const clearOverride = (id: number) => {
    setPinOverrides((prev) => {
      if (!Object.hasOwn(prev, id)) return prev;
      const { [id]: _dropped, ...rest } = prev;
      return rest;
    });
  };

  const markPinPending = (id: number, pending: boolean) => {
    setPinPendingIds((prev) => {
      if (pending === prev.has(id)) return prev;
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleTogglePin = (id: number, currentPinned: boolean) => {
    if (pinPendingIds.has(id)) return;
    const optimistic = !currentPinned;
    setPinOverrides((prev) => ({ ...prev, [id]: optimistic }));
    markPinPending(id, true);
    startPinTransition(async () => {
      try {
        const result = await togglePinSubscription(id);
        if (!result.success) {
          clearOverride(id);
          toast.error(result.error ?? "Failed to toggle pin");
          return;
        }
        // Refresh the RSC tree so `subscription.isPinned` catches up; the
        // reconcile effect then drops the override once prop === override.
        router.refresh();
      } catch (error) {
        console.error("[SubscriptionsList] togglePinSubscription threw", error);
        clearOverride(id);
        toast.error("Couldn't update pin. Check your connection and retry.");
      } finally {
        markPinPending(id, false);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Select
          value={sort}
          onValueChange={handleSortChange}
          disabled={isSortPending}
        >
          <SelectTrigger className="w-[200px]" aria-label="Sort subscriptions">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUBSCRIPTION_SORTS.map((value) => (
              <SelectItem key={value} value={value}>
                {SORT_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {subscriptions.map((subscription) => {
          const displayedPinned =
            pinOverrides[subscription.id] ?? subscription.isPinned;
          return (
            <SubscriptionCard
              key={subscription.id}
              podcast={subscription.podcast}
              subscribedAt={subscription.subscribedAt}
              isPinned={displayedPinned}
              pinDisabled={pinPendingIds.has(subscription.id)}
              onTogglePin={() =>
                handleTogglePin(subscription.id, displayedPinned)
              }
            />
          );
        })}
      </div>
    </div>
  );
}
