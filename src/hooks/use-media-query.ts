"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe hook that tracks a CSS media query.
 * Initialises as `false` on the server and during hydration,
 * then updates in a `useEffect` once the client is ready.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    function onChange(e: MediaQueryListEvent) {
      setMatches(e.matches);
    }

    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
