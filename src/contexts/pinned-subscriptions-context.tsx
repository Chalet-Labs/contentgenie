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
import {
  getPinnedSubscriptions,
  type PinnedSubscription,
} from "@/app/actions/subscriptions";

interface PinnedSubscriptionsContextValue {
  pinned: PinnedSubscription[];
  isLoading: boolean;
  refreshPins: () => void;
}

const DEFAULT_PINNED_CONTEXT_VALUE: PinnedSubscriptionsContextValue = {
  pinned: [],
  isLoading: false,
  refreshPins: () => {},
};

const PinnedSubscriptionsContext =
  createContext<PinnedSubscriptionsContextValue | null>(null);

export function PinnedSubscriptionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<{
    pinned: PinnedSubscription[];
    isLoading: boolean;
  }>({
    pinned: [],
    isLoading: true,
  });

  const refreshSerial = useRef(0);

  const refreshPins = useCallback(() => {
    setState((prev) => ({ ...prev, isLoading: true }));
    const serial = ++refreshSerial.current;

    getPinnedSubscriptions()
      .then((result) => {
        if (serial !== refreshSerial.current) return;
        if (!result.success) {
          console.warn(
            "[PinnedSubscriptions] Server returned error:",
            result.error,
          );
          setState((prev) => ({ ...prev, isLoading: false }));
          return;
        }
        setState({ pinned: result.data, isLoading: false });
      })
      .catch((error: unknown) => {
        if (serial !== refreshSerial.current) return;
        console.error(
          "[PinnedSubscriptions] Failed to fetch pinned subscriptions:",
          error,
        );
        setState((prev) => ({ ...prev, isLoading: false }));
      });
  }, []);

  useEffect(() => {
    refreshPins();
  }, [refreshPins]);

  /**
   * "pins-changed" CustomEvent contract
   * Dispatched by: clients mutating the user's pinned set (e.g. /subscriptions
   *   pin-toggle handler — to be wired in follow-up).
   * Consumed by: PinnedSubscriptionsProvider — refetches via refreshPins().
   * Payload: none. Precedent: "sync-queue-drained" (sync-queue-context.tsx:118).
   */
  useEffect(() => {
    const handlePinsChanged = () => refreshPins();
    window.addEventListener("pins-changed", handlePinsChanged);
    return () => window.removeEventListener("pins-changed", handlePinsChanged);
  }, [refreshPins]);

  const value = useMemo<PinnedSubscriptionsContextValue>(
    () => ({ ...state, refreshPins }),
    [state, refreshPins],
  );

  return (
    <PinnedSubscriptionsContext.Provider value={value}>
      {children}
    </PinnedSubscriptionsContext.Provider>
  );
}

export function usePinnedSubscriptions(): PinnedSubscriptionsContextValue {
  const ctx = useContext(PinnedSubscriptionsContext);
  if (!ctx) {
    throw new Error(
      "usePinnedSubscriptions must be used within PinnedSubscriptionsProvider",
    );
  }
  return ctx;
}

export function usePinnedSubscriptionsOptional(): PinnedSubscriptionsContextValue {
  const ctx = useContext(PinnedSubscriptionsContext);
  return ctx ?? DEFAULT_PINNED_CONTEXT_VALUE;
}
