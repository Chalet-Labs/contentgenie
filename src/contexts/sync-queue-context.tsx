"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  getActiveAndFailed,
  getPending,
  dequeue,
  markFailed,
  incrementAttempts,
  markInFlight,
  resetStaleInFlight,
  type SyncQueueItem,
} from "@/lib/sync-queue";

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const MAX_RETRY_ATTEMPTS = 3;
const SYNC_REPLAY_LOCK = "contentgenie-sync-replay";

// ─── Action -> API route mapping ──────────────────────────────────────────────

const ACTION_ROUTES: Record<SyncQueueItem["action"], string> = {
  "save-episode": "/api/library/save",
  "unsave-episode": "/api/library/unsave",
  subscribe: "/api/subscriptions/subscribe",
  unsubscribe: "/api/subscriptions/unsubscribe",
};

// ─── Context types ────────────────────────────────────────────────────────────

interface SyncQueueContextValue {
  pendingCount: number;
  isSyncing: boolean;
  hasPending: (entityKey: string) => boolean;
  hasFailed: (entityKey: string) => boolean;
  replayAll: () => Promise<void>;
}

const SyncQueueContext = createContext<SyncQueueContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SyncQueueProvider({ children }: { children: ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeItems, setActiveItems] = useState<SyncQueueItem[]>([]);
  const [failedItems, setFailedItems] = useState<SyncQueueItem[]>([]);
  const isSyncingRef = useRef(false);

  // Refresh counts, active items, and failed items from IDB (single-pass)
  const refreshQueue = useCallback(async () => {
    const { active, failed } = await getActiveAndFailed();
    setActiveItems(active);
    setFailedItems(failed);
    setPendingCount(active.length);
  }, []);

  // Shared retry/fail handler for failed replay attempts
  const handleRetryOrFail = useCallback(async (item: SyncQueueItem) => {
    await incrementAttempts(item.id);
    if (item.attempts + 1 >= MAX_RETRY_ATTEMPTS) {
      await markFailed(item.id);
    }
  }, []);

  // Replay all pending queue items via API routes, guarded by navigator.locks
  const replayAll = useCallback(async () => {
    if (isSyncingRef.current) return;

    const doReplay = async () => {
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
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              credentials: "include",
              body: JSON.stringify(item.payload),
            });

            if (response.ok) {
              await dequeue(item.id);
            } else if (response.status === 401) {
              // Session expired — drain immediately, don't retry
              await dequeue(item.id);
            } else {
              await handleRetryOrFail(item);
            }
          } catch {
            // Network error during replay
            await handleRetryOrFail(item);
          }
        }
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
        await refreshQueue();
        window.dispatchEvent(new Event("sync-queue-drained"));
      }
    };

    // Use navigator.locks to prevent concurrent replay from SW and client
    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request(
        SYNC_REPLAY_LOCK,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return; // Another replay is in progress
          await doReplay();
        },
      );
    } else {
      await doReplay();
    }
  }, [refreshQueue, handleRetryOrFail]);

  // Per-entity pending check
  const hasPending = useCallback(
    (entityKey: string): boolean => {
      return activeItems.some(
        (item) =>
          item.entityKey === entityKey &&
          (item.status === "pending" || item.status === "in-flight"),
      );
    },
    [activeItems],
  );

  // Per-entity failed check
  const hasFailed = useCallback(
    (entityKey: string): boolean => {
      return failedItems.some((item) => item.entityKey === entityKey);
    },
    [failedItems],
  );

  // Initial load: reset stale in-flight items + event listeners
  useEffect(() => {
    // Acquire replay lock before resetting to avoid racing with an in-progress replay
    const doReset = async () => {
      if (typeof navigator !== "undefined" && navigator.locks) {
        await navigator.locks.request(SYNC_REPLAY_LOCK, async () => {
          await resetStaleInFlight();
        });
      } else {
        await resetStaleInFlight();
      }
      await refreshQueue();
      // Replay immediately if already online — no "online" event will fire
      if (typeof navigator !== "undefined" && navigator.onLine) {
        void replayAll();
      }
    };
    void doReset();

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

  return (
    <SyncQueueContext.Provider
      value={{ pendingCount, isSyncing, hasPending, hasFailed, replayAll }}
    >
      {children}
    </SyncQueueContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSyncQueueContext() {
  const ctx = useContext(SyncQueueContext);
  if (!ctx) {
    throw new Error(
      "useSyncQueueContext must be used within a SyncQueueProvider",
    );
  }
  return ctx;
}
