"use client";

import {
  useState,
  useTransition,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, X } from "lucide-react";
import {
  dismissNotification,
  markNotificationRead,
  markAllNotificationsRead,
  getNotifications,
  getEpisodeTopics,
} from "@/app/actions/notifications";
import { getListenedEpisodeIds } from "@/app/actions/listen-history";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AddToQueueButton } from "@/components/audio-player/add-to-queue-button";
import { PlayEpisodeButton } from "@/components/audio-player/play-episode-button";
import { EpisodeCard } from "@/components/episodes/episode-card";
import { ListenedButton } from "@/components/episodes/listened-button";
import { formatRelativeTime } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import {
  LISTEN_STATE_CHANGED_EVENT,
  NOTIFICATIONS_CHANGED_EVENT,
  type NotificationsChangedEventDetail,
} from "@/lib/events";
import { NOTIFICATIONS_PAGE_SIZE } from "@/lib/notifications-constants";
import type { PodcastIndexEpisodeId } from "@/types/ids";

type NotificationItem = Awaited<
  ReturnType<typeof getNotifications>
>["notifications"][number];

// Per-item optimistic flag: true while a dismiss is inflight and unconfirmed.
// Server success drops the row; failure clears the flag so the row reappears.
type LocalNotification = NotificationItem & { pendingDismiss?: boolean };

function toastErrorWithRetry(message: string, retry: () => void) {
  toast.error(message, { action: { label: "Retry", onClick: retry } });
}

type Tab = "all" | "unread" | "read";

interface NotificationPageListProps {
  initialItems: NotificationItem[];
  initialHasMore: boolean;
  initialTopicsByEpisode: Record<number, string[]>;
  /**
   * Podcast-index-episode-ids (strings) that the current user has completed.
   * Passed as an array because RSC Flight can't serialize Sets; we build the
   * Set client-side. Matches the pattern in `src/components/podcasts/episode-list.tsx`.
   */
  initialListenedIds?: PodcastIndexEpisodeId[];
  filter?: { podcastId?: number; since?: Date };
}

export function NotificationPageList({
  initialItems,
  initialHasMore,
  initialTopicsByEpisode,
  initialListenedIds,
  filter,
}: NotificationPageListProps) {
  const router = useRouter();
  const [items, setItems] = useState<LocalNotification[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [listenedIds, setListenedIds] = useState<PodcastIndexEpisodeId[]>(
    initialListenedIds ?? [],
  );
  const listenedSet = useMemo(() => new Set(listenedIds), [listenedIds]);
  // Derive from initialItems.length instead of a hardcoded page size so a
  // partial first page (e.g., dismissals between SSR and hydration) doesn't
  // cause "Load more" to skip unfetched rows.
  const offsetRef = useRef(initialItems.length);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [topicsByEpisode, setTopicsByEpisode] = useState<
    Record<number, string[]>
  >(initialTopicsByEpisode);
  const [isPending, startTransition] = useTransition();

  const visibleItems = items.filter((n) => !n.pendingDismiss);

  // Refresh listened state when any ListenedButton fires a mark. Without this,
  // remounted rows or duplicate-episode notifications would revert to the
  // "Mark as listened" affordance after a successful toggle elsewhere.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const refreshSeqRef = useRef(0);
  useEffect(() => {
    const refresh = async () => {
      const seq = ++refreshSeqRef.current;
      const current = itemsRef.current;
      const dbIds = current
        .map((n) => n.episodeDbId)
        .filter((id): id is number => id !== null);
      if (dbIds.length === 0) return;
      try {
        const listenedDbIds = new Set(await getListenedEpisodeIds(dbIds));
        // Drop stale responses when a newer refresh is already in flight.
        if (seq !== refreshSeqRef.current) return;
        const piIds = current.flatMap((n) => {
          if (
            n.episodeDbId !== null &&
            listenedDbIds.has(n.episodeDbId) &&
            n.episodePodcastIndexId !== null
          ) {
            return [n.episodePodcastIndexId]; // narrowed to PodcastIndexEpisodeId
          }
          return [];
        });
        setListenedIds((prev) => {
          // getListenedEpisodeIds returns [] on failure and on "no listens"
          // alike. Treat empty-while-prev-non-empty as a likely failure and
          // preserve prev so a transient server glitch doesn't wipe every row.
          if (piIds.length === 0 && prev.length > 0) return prev;
          if (
            prev.length === piIds.length &&
            prev.every((id, i) => id === piIds[i])
          ) {
            return prev;
          }
          return piIds;
        });
      } catch (err) {
        console.error("[notifications] listen-state refresh failed", err);
      }
    };
    window.addEventListener(LISTEN_STATE_CHANGED_EVENT, refresh);
    return () =>
      window.removeEventListener(LISTEN_STATE_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NotificationsChangedEventDetail>).detail;
      const ids = new Set(detail?.episodeDbIds ?? []);
      // All production dispatch sites only fire on confirmed dismisses with
      // populated ids — an empty payload is a no-op event we don't act on.
      if (ids.size === 0) return;
      let removed = 0;
      setItems((prev) => {
        const next = prev.filter(
          (n) => n.episodeDbId === null || !ids.has(n.episodeDbId),
        );
        removed = prev.length - next.length;
        return next;
      });
      // Mirror handleDismiss: keep offsetRef in sync so a subsequent
      // Load more uses the post-filter offset and doesn't skip rows.
      // Done outside the updater so a StrictMode double-invocation or
      // concurrent re-render doesn't decrement twice.
      if (removed > 0) {
        offsetRef.current = Math.max(0, offsetRef.current - removed);
      }
      router.refresh();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
    return () =>
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
  }, [router]);

  const handleDismiss = useCallback((id: number) => {
    startTransition(async () => {
      // Decrement offset optimistically so a concurrent Load more uses the
      // post-dismiss offset and doesn't skip a server row (#315).
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, pendingDismiss: true } : n)),
      );
      const offsetBefore = offsetRef.current;
      offsetRef.current = Math.max(0, offsetBefore - 1);
      const offsetDelta = offsetBefore - offsetRef.current;
      const rollback = (errorMessage: string) => {
        setItems((prev) =>
          prev.map((n) => (n.id === id ? { ...n, pendingDismiss: false } : n)),
        );
        offsetRef.current += offsetDelta;
        toastErrorWithRetry(errorMessage, () => handleDismiss(id));
      };
      let result: Awaited<ReturnType<typeof dismissNotification>>;
      try {
        result = await dismissNotification(id);
      } catch (err) {
        console.error("[notifications] dismiss threw", { id, err });
        rollback("Failed to dismiss notification");
        return;
      }
      if (result.success) {
        setItems((prev) => prev.filter((n) => n.id !== id));
      } else {
        console.error("[notifications] dismiss failed", {
          id,
          error: result.error,
        });
        rollback(result.error ?? "Failed to dismiss notification");
      }
    });
  }, []);

  const markReadOptimistic = useCallback((item: NotificationItem) => {
    if (item.isRead) return;
    // Optimistic flip + rollback on failure keeps interactions snappy without
    // letting a stale read=true linger if the server rejects the mutation.
    setItems((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
    );
    markNotificationRead(item.id)
      .then((result) => {
        if (!result.success) {
          setItems((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, isRead: false } : n)),
          );
          toast.error(result.error ?? "Couldn't mark as read");
        }
      })
      .catch(() => {
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: false } : n)),
        );
        toast.error("Couldn't mark as read");
      });
  }, []);

  const handleRowClick = useCallback(
    (item: NotificationItem) => {
      markReadOptimistic(item);
      if (item.episodePodcastIndexId) {
        router.push(ROUTES.episode(item.episodePodcastIndexId));
      }
    },
    [markReadOptimistic, router],
  );

  const handleMarkAllRead = useCallback(async () => {
    const retry = () => handleMarkAllRead();
    try {
      const result = await markAllNotificationsRead();
      if (result.success) {
        setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      } else {
        toastErrorWithRetry(
          result.error ?? "Failed to mark all as read",
          retry,
        );
      }
    } catch {
      toastErrorWithRetry("Failed to mark all as read", retry);
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    const retry = () => handleLoadMore();
    startTransition(async () => {
      try {
        const result = await getNotifications(
          NOTIFICATIONS_PAGE_SIZE,
          offsetRef.current,
          filter,
        );
        if (result.error) {
          toastErrorWithRetry("Failed to load more notifications", retry);
          return;
        }
        if (result.notifications.length === 0) {
          setHasMore(false);
          return;
        }
        const newItems = result.notifications;
        const newEpisodeIds = newItems
          .map((n) => n.episodeDbId)
          .filter((id): id is number => id !== null);
        let newTopics: Record<number, string[]> = {};
        let newListenedPiIds: PodcastIndexEpisodeId[] = [];
        if (newEpisodeIds.length > 0) {
          const [topicsResult, listenedResult] = await Promise.allSettled([
            getEpisodeTopics(newEpisodeIds),
            getListenedEpisodeIds(newEpisodeIds),
          ]);
          if (topicsResult.status === "fulfilled") {
            newTopics = topicsResult.value;
          } else {
            // Degrade gracefully — append rows without topic chips.
            console.error(
              "[notifications] getEpisodeTopics failed",
              topicsResult.reason,
            );
          }
          if (listenedResult.status === "fulfilled") {
            const listenedDbIds = new Set(listenedResult.value);
            newListenedPiIds = newItems.flatMap((n) => {
              if (
                n.episodeDbId !== null &&
                listenedDbIds.has(n.episodeDbId) &&
                n.episodePodcastIndexId !== null
              ) {
                return [n.episodePodcastIndexId]; // narrowed to PodcastIndexEpisodeId
              }
              return [];
            });
          } else {
            // Degrade gracefully — rows stay "unlistened" on failure; the
            // user can re-mark if needed.
            console.error(
              "[notifications] getListenedEpisodeIds failed",
              listenedResult.reason,
            );
          }
        }
        // De-dupe by id: a Load more fired during an in-flight dismiss uses
        // offset N-1; if that dismiss later fails (rollback restores the row),
        // the appended page can overlap with already-rendered rows. Filtering
        // here keeps React keys unique without coupling to dismiss state (#315).
        setItems((prev) => {
          const seen = new Set(prev.map((n) => n.id));
          const additions = newItems.filter((n) => !seen.has(n.id));
          return additions.length === 0 ? prev : [...prev, ...additions];
        });
        setTopicsByEpisode((prev) => ({ ...prev, ...newTopics }));
        if (newListenedPiIds.length > 0) {
          setListenedIds((prev) =>
            Array.from(new Set([...prev, ...newListenedPiIds])),
          );
        }
        offsetRef.current = offsetRef.current + NOTIFICATIONS_PAGE_SIZE;
        setHasMore(result.hasMore ?? false);
      } catch {
        toastErrorWithRetry("Failed to load more notifications", retry);
      }
    });
  }, [filter]);

  const renderPanel = (tab: Tab, filtered: LocalNotification[]) => {
    const showEmptyState = filtered.length === 0 && !hasMore;
    return (
      <TabsContent key={tab} value={tab} className="mt-4">
        {showEmptyState ? (
          <EmptyState activeTab={tab} hasItems={visibleItems.length > 0} />
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                topics={
                  (item.episodeDbId
                    ? topicsByEpisode[item.episodeDbId]
                    : undefined) ?? []
                }
                isListened={
                  item.episodePodcastIndexId
                    ? listenedSet.has(item.episodePodcastIndexId)
                    : false
                }
                onRowClick={handleRowClick}
                onMarkRead={markReadOptimistic}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        )}
        {hasMore && (
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
    );
  };

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
        {/* Render a TabsContent per tab so each trigger's aria-controls resolves
         * to a mounted panel; Radix hides inactive ones via data-state. */}
        {renderPanel("all", visibleItems)}
        {renderPanel(
          "unread",
          visibleItems.filter((n) => !n.isRead),
        )}
        {renderPanel(
          "read",
          visibleItems.filter((n) => n.isRead),
        )}
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
  isListened,
  onRowClick,
  onMarkRead,
  onDismiss,
}: {
  item: NotificationItem;
  topics: string[];
  isListened: boolean;
  onRowClick: (item: NotificationItem) => void;
  onMarkRead: (item: NotificationItem) => void;
  onDismiss: (id: number) => void;
}) {
  const handleTitleNavigate = () => onMarkRead(item);

  const audioEpisode =
    item.audioUrl && item.episodePodcastIndexId
      ? {
          id: item.episodePodcastIndexId,
          title: item.episodeTitle ?? item.title,
          podcastTitle: item.podcastTitle ?? "Podcast",
          audioUrl: item.audioUrl,
          ...(item.artwork ? { artwork: item.artwork } : {}),
          ...(item.duration != null ? { duration: item.duration } : {}),
        }
      : null;

  let primaryAction: React.ReactNode = null;
  if (audioEpisode) {
    primaryAction = (
      <PlayEpisodeButton
        episode={audioEpisode}
        onBeforePlay={() => onMarkRead(item)}
      />
    );
  } else if (item.episodePodcastIndexId) {
    primaryAction = (
      <Button size="sm" variant="outline" onClick={() => onRowClick(item)}>
        View episode
      </Button>
    );
  }

  return (
    <article data-read={item.isRead}>
      <EpisodeCard
        artwork={item.artwork}
        podcastTitle={item.podcastTitle ?? "Podcast"}
        title={item.episodeTitle ?? item.title}
        href={
          item.episodePodcastIndexId
            ? ROUTES.episode(item.episodePodcastIndexId)
            : undefined
        }
        onTitleClick={handleTitleNavigate}
        topics={topics}
        score={item.worthItScore}
        accent={item.isRead ? "none" : "unread"}
        isListened={isListened}
        meta={[<span key="time">{formatRelativeTime(item.createdAt)}</span>]}
        primaryAction={primaryAction}
        secondaryActions={
          <>
            {audioEpisode && (
              <AddToQueueButton episode={audioEpisode} variant="icon" />
            )}
            {item.episodePodcastIndexId && (
              <ListenedButton
                podcastIndexEpisodeId={item.episodePodcastIndexId}
                isListened={isListened}
              />
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
          </>
        }
      />
    </article>
  );
}
