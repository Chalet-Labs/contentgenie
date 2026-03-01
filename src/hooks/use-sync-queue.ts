"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getPending,
  dequeue,
  markFailed,
  incrementAttempts,
  markInFlight,
  type SyncQueueItem,
} from "@/lib/sync-queue";

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const MAX_RETRY_ATTEMPTS = 3;

// ─── Action -> API route mapping ──────────────────────────────────────────────

const ACTION_ROUTES: Record<SyncQueueItem["action"], string> = {
  "save-episode": "/api/library/save",
  "unsave-episode": "/api/library/unsave",
  subscribe: "/api/subscriptions/subscribe",
  unsubscribe: "/api/subscriptions/unsubscribe",
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSyncQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingItems, setPendingItems] = useState<SyncQueueItem[]>([]);
  const isSyncingRef = useRef(false);

  // Refresh counts and pending items from IDB (single scan)
  const refreshQueue = useCallback(async () => {
    const items = await getPending();
    setPendingItems(items);
    setPendingCount(items.length);
  }, []);

  // Replay all pending queue items via API routes
  const replayAll = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const items = await getPending();

      for (const item of items) {
        const route = ACTION_ROUTES[item.action];
        await markInFlight(item.id);

        try {
          const response = await fetch(route, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(item.payload),
          });

          if (response.ok) {
            await dequeue(item.id);
          } else if (response.status === 401) {
            // Session expired — drain immediately, don't retry
            await dequeue(item.id);
          } else {
            await incrementAttempts(item.id);
            if (item.attempts + 1 >= MAX_RETRY_ATTEMPTS) {
              await markFailed(item.id);
            }
          }
        } catch {
          // Network error during replay
          await incrementAttempts(item.id);
          if (item.attempts + 1 >= MAX_RETRY_ATTEMPTS) {
            await markFailed(item.id);
          }
        }
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      await refreshQueue();
    }
  }, [refreshQueue]);

  // Per-entity pending check
  const hasPending = useCallback(
    (entityKey: string): boolean => {
      return pendingItems.some((item) => item.entityKey === entityKey);
    },
    [pendingItems],
  );

  // Initial load + event listeners (online, SW message)
  useEffect(() => {
    void refreshQueue();

    // Online event: fallback replay for Safari/Firefox
    const handleOnline = () => {
      void replayAll();
    };

    // SW message: sync-complete notification
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "sync-complete") {
        void refreshQueue();
      }
    };

    window.addEventListener("online", handleOnline);

    // Listen on the ServiceWorker message channel (where client.postMessage lands)
    const swContainer = navigator.serviceWorker;
    if (swContainer) {
      swContainer.addEventListener("message", handleMessage);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      if (swContainer) {
        swContainer.removeEventListener("message", handleMessage);
      }
    };
  }, [refreshQueue, replayAll]);

  // Conditional polling: only poll when queue is non-empty
  useEffect(() => {
    if (pendingCount === 0) return;

    const intervalId = setInterval(() => {
      void refreshQueue();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [pendingCount, refreshQueue]);

  return {
    pendingCount,
    isSyncing,
    hasPending,
    replayAll,
  };
}
