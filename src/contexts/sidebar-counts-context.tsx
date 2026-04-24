"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getDashboardStats } from "@/app/actions/dashboard";
import { ROUTES } from "@/lib/routes";

interface SidebarCountsState {
  subscriptionCount: number;
  savedCount: number;
  isLoading: boolean;
}

interface SidebarCountsContextValue extends SidebarCountsState {
  refreshCounts: () => void;
}

const SidebarCountsContext = createContext<SidebarCountsContextValue | null>(
  null,
);

const DEFAULT_COUNTS: SidebarCountsContextValue = {
  subscriptionCount: 0,
  savedCount: 0,
  isLoading: false,
  refreshCounts: () => {},
};

export function SidebarCountsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SidebarCountsState>({
    subscriptionCount: 0,
    savedCount: 0,
    isLoading: true,
  });

  const refreshSerial = useRef(0);

  const refreshCounts = useCallback(() => {
    setState((prev) => ({ ...prev, isLoading: true }));
    const serial = ++refreshSerial.current;

    getDashboardStats()
      .then((stats) => {
        if (serial !== refreshSerial.current) return;
        if (stats.error) {
          console.warn("[SidebarCounts] Server returned error:", stats.error);
          setState((prev) => ({ ...prev, isLoading: false }));
          return;
        }
        setState({
          subscriptionCount: stats.subscriptionCount,
          savedCount: stats.savedCount,
          isLoading: false,
        });
      })
      .catch((error: unknown) => {
        if (serial !== refreshSerial.current) return;
        console.error(
          "[SidebarCounts] Failed to fetch dashboard stats:",
          error,
        );
        setState((prev) => ({ ...prev, isLoading: false }));
      });
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  // Refresh badge counts when the sync queue finishes draining (offline → online)
  useEffect(() => {
    const handleDrained = () => refreshCounts();
    window.addEventListener("sync-queue-drained", handleDrained);
    return () =>
      window.removeEventListener("sync-queue-drained", handleDrained);
  }, [refreshCounts]);

  const value = useMemo<SidebarCountsContextValue>(
    () => ({ ...state, refreshCounts }),
    [state, refreshCounts],
  );

  return (
    <SidebarCountsContext.Provider value={value}>
      {children}
    </SidebarCountsContext.Provider>
  );
}

export function useSidebarCounts(): SidebarCountsContextValue {
  const ctx = useContext(SidebarCountsContext);
  if (!ctx) {
    throw new Error(
      "useSidebarCounts must be used within SidebarCountsProvider",
    );
  }
  return ctx;
}

/** Safe variant — returns zero counts when rendered outside the provider (e.g. public landing page). */
export function useSidebarCountsOptional(): SidebarCountsContextValue {
  const ctx = useContext(SidebarCountsContext);
  return ctx ?? DEFAULT_COUNTS;
}

/** Resolve the badge count for a given nav href, or null if no badge should be shown. */
export function getBadgeCount(
  href: string,
  counts: SidebarCountsState,
): number | null {
  if (counts.isLoading) return null;
  if (href === ROUTES.SUBSCRIPTIONS && counts.subscriptionCount > 0)
    return counts.subscriptionCount;
  if (href === ROUTES.LIBRARY && counts.savedCount > 0)
    return counts.savedCount;
  return null;
}

/** Renders a badge pill with the given count, capped at 99+. */
export function NavBadge({ count }: { count: number }) {
  return (
    <span className="ml-auto min-w-[1.25rem] rounded-full bg-muted px-1.5 text-center text-xs text-muted-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}
