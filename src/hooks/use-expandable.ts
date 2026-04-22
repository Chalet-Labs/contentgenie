"use client";

import { useCallback, useState } from "react";

export interface UseExpandableResult<T> {
  visible: T[];
  expanded: boolean;
  hiddenCount: number;
  shouldShowToggle: boolean;
  toggle: () => void;
}

export function useExpandable<T>(items: T[], initial: number): UseExpandableResult<T> {
  const [expanded, setExpanded] = useState(false);
  const visible = items.slice(0, expanded ? undefined : initial);
  const shouldShowToggle = items.length > initial;
  const hiddenCount = Math.max(0, items.length - initial);
  const toggle = useCallback(() => setExpanded((prev) => !prev), []);
  return { visible, expanded, hiddenCount, shouldShowToggle, toggle };
}
