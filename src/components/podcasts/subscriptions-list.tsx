"use client";

import { useState, useTransition } from "react";
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
import { SUBSCRIPTION_SORTS, type SubscriptionSort } from "@/db/schema";

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
  const [isPending, startTransition] = useTransition();

  const handleSortChange = (next: string) => {
    if (!SUBSCRIPTION_SORTS.includes(next as SubscriptionSort)) return;
    const nextSort = next as SubscriptionSort;
    const prev = sort;
    setSort(nextSort);
    startTransition(async () => {
      const result = await setSubscriptionSort(nextSort);
      if (!result.success) {
        setSort(prev);
        toast.error(result.error ?? "Failed to update sort");
        return;
      }
      router.refresh();
    });
  };

  const clearOverride = (id: number) => {
    setPinOverrides((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _dropped, ...rest } = prev;
      return rest;
    });
  };

  const handleTogglePin = (id: number, currentPinned: boolean) => {
    const optimistic = !currentPinned;
    setPinOverrides((prev) => ({ ...prev, [id]: optimistic }));
    startTransition(async () => {
      const result = await togglePinSubscription(id);
      if (!result.success) {
        clearOverride(id);
        toast.error(result.error ?? "Failed to toggle pin");
        return;
      }
      clearOverride(id);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Select value={sort} onValueChange={handleSortChange} disabled={isPending}>
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
              subscriptionId={subscription.id}
              podcast={subscription.podcast}
              subscribedAt={subscription.subscribedAt}
              isPinned={displayedPinned}
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
