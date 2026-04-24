"use client";

import { useEffect, useState } from "react";
import type { Chapter } from "@/lib/chapters";

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
 * Routes through the server proxy for the same reason the audio player
 * does: the proxy applies the SSRF guard, enforces a timeout, and sets
 * cacheable response headers. Calling the feed URL directly from the
 * browser would regress on cross-origin feeds and HTTP-only CDNs.
 */
export function useChapters(
  chaptersUrl: string | null | undefined,
): UseChaptersState {
  const [state, setState] = useState<UseChaptersState>({ status: "idle" });

  useEffect(() => {
    if (!chaptersUrl) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    setState({ status: "loading" });

    fetch(`/api/chapters?url=${encodeURIComponent(chaptersUrl)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { chapters: Chapter[] };
      })
      .then(({ chapters }) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", chapters });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Failed to load chapters";
        console.warn("[chapters] fetch failed", { chaptersUrl, message });
        setState({ status: "error", message });
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [chaptersUrl]);

  return state;
}
