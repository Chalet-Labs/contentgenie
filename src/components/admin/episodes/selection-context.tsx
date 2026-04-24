"use client";

import { createContext, useContext } from "react";

export interface SelectionContextValue {
  selectedIds: Set<number>;
  toggle: (id: number) => void;
  selectAll: (ids: number[]) => void;
  clearAll: () => void;
}

export const SelectionContext = createContext<SelectionContextValue>({
  selectedIds: new Set(),
  toggle: () => {},
  selectAll: () => {},
  clearAll: () => {},
});

export function useSelection() {
  return useContext(SelectionContext);
}
