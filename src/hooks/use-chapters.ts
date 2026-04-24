"use client";

import { useEffect, useState } from "react";
import { parseChapters, type Chapter } from "@/lib/chapters";

export type UseChaptersState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; chapters: Chapter[] }
  | { status: "error"; message: string };

/**
 * Fetch and parse a JSON Chapters payload from `chaptersUrl`.
 *
 * Returns `idle` when no URL is provided. Consumers should handle all four states.
 */
export function useChapters(
  chaptersUrl: string | null | undefined,
): UseChaptersState {
  const [state, setState] = useState<UseChaptersState>(
    chaptersUrl ? { status: "loading" } : { status: "idle" },
  );

  useEffect(() => {
    if (!chaptersUrl) {
      setState({ status: "idle" });
      return;
    }

    let ignore = false;
    setState({ status: "loading" });

    fetch(chaptersUrl)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load chapters (HTTP ${res.status})`);
        }
        const json = (await res.json()) as unknown;
        return parseChapters(json);
      })
      .then((chapters) => {
        if (!ignore) setState({ status: "ready", chapters });
      })
      .catch((err) => {
        if (!ignore) {
          setState({
            status: "error",
            message:
              err instanceof Error ? err.message : "Failed to load chapters",
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [chaptersUrl]);

  return state;
}
