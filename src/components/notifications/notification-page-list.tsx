"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, X, ListPlus } from "lucide-react";
import {
  dismissNotification,
  markNotificationRead,
  markAllNotificationsRead,
  getNotifications,
  getEpisodeTopics,
} from "@/app/actions/notifications";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WorthItBadge } from "@/components/episodes/worth-it-badge";
import { AddToQueueButton } from "@/components/audio-player/add-to-queue-button";
import { formatRelativeTime } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  episodeDbId: number | null;
  episodePodcastIndexId: string | null;
  episodeTitle: string | null;
  podcastTitle: string | null;
  worthItScore: string | null;
  audioUrl: string | null;
  artwork: string | null;
  duration: number | null;
};

type Tab = "all" | "unread" | "read";

interface NotificationPageListProps {
  initialItems: NotificationItem[];
  initialHasMore: boolean;
  initialTopicsByEpisode: Record<number, string[]>;
}

export function NotificationPageList({
  initialItems,
  initialHasMore,
  initialTopicsByEpisode,
}: NotificationPageListProps) {
  const router = useRouter();
  const PAGE_SIZE = 50;
  const [items, setItems] = useState<NotificationItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [offset, setOffset] = useState(PAGE_SIZE);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [topicsByEpisode, setTopicsByEpisode] =
    useState<Record<number, string[]>>(initialTopicsByEpisode);
  const [isPending, startTransition] = useTransition();
  // Tracks ids that have been optimistically dismissed but not yet server-confirmed.
  // On server failure, the id is removed from this set, restoring the row.
  const [optimisticDismissed, setOptimisticDismissed] = useState<Set<number>>(
    new Set()
  );

  const optimisticItems = items.filter((n) => !optimisticDismissed.has(n.id));

  const filteredItems =
    activeTab === "unread"
      ? optimisticItems.filter((n) => !n.isRead)
      : activeTab === "read"
        ? optimisticItems.filter((n) => n.isRead)
        : optimisticItems;

  const handleDismiss = useCallback(
    (id: number) => {
      startTransition(async () => {
        setOptimisticDismissed((prev) => new Set(Array.from(prev).concat(id)));
        const result = await dismissNotification(id);
        if (result.success) {
          setItems((prev) => prev.filter((n) => n.id !== id));
          setOptimisticDismissed((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        } else {
          setOptimisticDismissed((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          toast.error("Failed to dismiss notification", {
            action: { label: "Retry", onClick: () => handleDismiss(id) },
          });
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleRowClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      await markNotificationRead(item.id);
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
    }
    router.push(
      item.episodePodcastIndexId
        ? ROUTES.episode(item.episodePodcastIndexId)
        : ROUTES.DASHBOARD
    );
  };

  const handleMarkAllRead = async () => {
    const result = await markAllNotificationsRead();
    if (result.success) {
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    }
  };

  const handleLoadMore = () => {
    startTransition(async () => {
      const result = await getNotifications(50, offset);
      if (!result.error && result.notifications.length > 0) {
        const newItems = result.notifications as NotificationItem[];
        const newEpisodeIds = newItems
          .map((n) => n.episodeDbId)
          .filter((id): id is number => id !== null);
        const newTopicsMap =
          newEpisodeIds.length > 0
            ? await getEpisodeTopics(newEpisodeIds)
            : new Map<number, string[]>();
        const newTopics: Record<number, string[]> = {};
        newTopicsMap.forEach((topics, id) => {
          newTopics[id] = topics;
        });
        setItems((prev) => [...prev, ...newItems]);
        setTopicsByEpisode((prev) => ({ ...prev, ...newTopics }));
        setOffset((prev) => prev + PAGE_SIZE);
        setHasMore(result.hasMore ?? false);
      } else {
        setHasMore(false);
      }
    });
  };

  const showEmptyState =
    filteredItems.length === 0 && (!hasMore || activeTab !== "all");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
            Mark all as read
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
          <TabsTrigger value="read">Read</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {showEmptyState ? (
            <EmptyState activeTab={activeTab} hasItems={items.length > 0} />
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  topics={(item.episodeDbId ? topicsByEpisode[item.episodeDbId] : undefined) ?? []}
                  onRowClick={handleRowClick}
                  onDismiss={handleDismiss}
                />
              ))}
            </div>
          )}

          {hasMore && activeTab === "all" && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={isPending}
              >
                {isPending ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({
  activeTab,
  hasItems,
}: {
  activeTab: Tab;
  hasItems: boolean;
}) {
  if (activeTab === "unread" && hasItems) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No unread notifications
      </p>
    );
  }
  if (activeTab === "read" && hasItems) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No read notifications
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
      <div className="mb-3 rounded-full bg-muted p-4">
        <Bell className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium">You&apos;re all caught up</p>
    </div>
  );
}

function NotificationRow({
  item,
  topics,
  onRowClick,
  onDismiss,
}: {
  item: NotificationItem;
  topics: string[];
  onRowClick: (item: NotificationItem) => void;
  onDismiss: (id: number) => void;
}) {
  const worthItScore =
    item.worthItScore !== null ? parseFloat(item.worthItScore) : null;

  const audioEpisode =
    item.audioUrl && item.episodePodcastIndexId
      ? {
          id: item.episodePodcastIndexId,
          title: item.episodeTitle ?? item.title,
          podcastTitle: item.podcastTitle ?? "",
          audioUrl: item.audioUrl,
          ...(item.artwork ? { artwork: item.artwork } : {}),
          ...(item.duration ? { duration: item.duration } : {}),
        }
      : null;

  return (
    <article
      className={`relative flex items-start gap-3 rounded-lg border p-4 ${
        !item.isRead ? "bg-accent/10" : ""
      }`}
    >
      <div className="flex-1 min-w-0 space-y-1">
        <button
          className="text-sm font-medium hover:underline text-left w-full truncate"
          onClick={() => onRowClick(item)}
        >
          {item.episodeTitle ?? item.title}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <WorthItBadge score={worthItScore} />
          {topics.slice(0, 3).map((topic) => (
            <Badge key={topic} variant="secondary" className="text-xs">
              {topic}
            </Badge>
          ))}
        </div>

        {item.podcastTitle && (
          <p className="text-xs text-muted-foreground">{item.podcastTitle}</p>
        )}

        <p className="text-xs text-muted-foreground">
          {formatRelativeTime(item.createdAt)}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {audioEpisode && (
          <AddToQueueButton episode={audioEpisode} variant="icon" />
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Dismiss"
          onClick={() => onDismiss(item.id)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}
