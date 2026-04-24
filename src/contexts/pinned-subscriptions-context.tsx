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
import { PINS_CHANGED_EVENT } from "@/lib/events";

interface PinnedSubscriptionsContextValue {
  readonly pinned: readonly PinnedSubscription[];
  readonly isLoading: boolean;
  readonly refreshPins: () => void;
}

const DEFAULT_PINNED_CONTEXT_VALUE: PinnedSubscriptionsContextValue =
  Object.freeze({
    pinned: Object.freeze([]) as readonly PinnedSubscription[],
    isLoading: false,
    refreshPins: () => {},
  });

const PinnedSubscriptionsContext =
  createContext<PinnedSubscriptionsContextValue | null>(null);

export function PinnedSubscriptionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<{
    pinned: readonly PinnedSubscription[];
    isLoading: boolean;
  }>({
    pinned: [],
    isLoading: true,
  });

  const refreshSerial = useRef(0);

  const refreshPins = useCallback(() => {
    setState((prev) => (prev.isLoading ? prev : { ...prev, isLoading: true }));
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
   * PINS_CHANGED_EVENT contract
   * Dispatched by: clients mutating the user's pinned set (e.g. the
   *   /subscriptions pin-toggle handler). No production dispatcher ships in
   *   this PR — the listener is speculative and will go dead if the follow-up
   *   uses a different event name.
   * Consumed by: PinnedSubscriptionsProvider — refetches via refreshPins().
   * Payload: none. Precedent: the queue-drain dispatch in sync-queue-context.tsx.
   */
  useEffect(() => {
    const handlePinsChanged = () => refreshPins();
    window.addEventListener(PINS_CHANGED_EVENT, handlePinsChanged);
    return () =>
      window.removeEventListener(PINS_CHANGED_EVENT, handlePinsChanged);
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
