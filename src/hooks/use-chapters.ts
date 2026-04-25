"use client";

import { useEffect, useRef, useState } from "react";
import { parseChapters, type Chapter } from "@/lib/chapters";

export type UseChaptersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; chapters: Chapter[] }
  | { status: "error"; message: string };

/**
 * Fetch a JSON Chapters payload via the `/api/chapters` proxy.
 *
 * Returns a discriminated union (not `chapters | null`) so consumers can
 * tell `loading` apart from `ready` with an empty feed and render the
 * right skeleton vs. empty-state copy.
 *
 * Routes through the server proxy because it applies the SSRF guard and
 * sets cacheable response headers — calling the feed URL directly from
 * the browser would regress on cross-origin feeds and HTTP-only CDNs.
 * The 5s timeout is enforced here on the client with an `AbortController`;
 * the server proxy itself does not time out `safeFetch` today.
 *
 * The aborts-as-errors distinction matters: an unmount/url-change abort
 * must be ignored silently, while a timeout abort must surface as an
 * error so the UI leaves the skeleton state. Tracking that with
 * `controller.signal.aborted` alone conflates the two — we use a
 * dedicated `didTimeout` flag instead.
 *
 * `isOnline` is an optional connectivity hint. When explicitly `false`,
 * the hook skips the fetch. State handling depends on the transition:
 * - Same URL: terminal states (ready/error) are preserved so a transient
 *   blip doesn't blank already-loaded chapters; a `loading` state is
 *   reset to idle because the fetch was aborted by the effect cleanup.
 * - URL changed while offline: state is reset to idle so the prior
 *   episode's chapters don't render under the new URL.
 * When `isOnline` flips back to `true`, the effect re-runs and retries.
 */
export function useChapters(
  chaptersUrl: string | null | undefined,
  isOnline?: boolean,
): UseChaptersState {
  const [state, setState] = useState<UseChaptersState>({ status: "idle" });
  const prevUrlRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const prevUrl = prevUrlRef.current;
    prevUrlRef.current = chaptersUrl;

    if (!chaptersUrl) {
      setState({ status: "idle" });
      return;
    }
    if (isOnline === false) {
      if (prevUrl !== chaptersUrl) {
        // Different URL while offline: drop the prior episode's payload so
        // it isn't rendered under the new URL.
        setState({ status: "idle" });
      } else {
        // Same URL during a connectivity blip: keep terminal state
        // (ready/error) visible so already-loaded chapters or the prior error
        // don't disappear. A `loading` state, though, refers to the fetch
        // the cleanup just aborted — clear it so the UI doesn't show a
        // perpetual skeleton during the outage.
        setState((prev) =>
          prev.status === "loading" ? { status: "idle" } : prev,
        );
      }
      return;
    }

    let ignore = false;
    let didTimeout = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, 5000);

    async function run() {
      setState({ status: "loading" });
      try {
        const res = await fetch(
          `/api/chapters?url=${encodeURIComponent(chaptersUrl!)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        const chapters = parseChapters(json);
        if (!ignore) {
          setState({ status: "ready", chapters });
        }
      } catch (err: unknown) {
        if (ignore) return;
        const message = didTimeout
          ? "Request timed out"
          : err instanceof Error
            ? err.message
            : "Failed to load chapters";
        console.warn("[chapters] fetch failed", { chaptersUrl, message });
        setState({ status: "error", message });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    void run();

    return () => {
      ignore = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [chaptersUrl, isOnline]);

  return state;
}
