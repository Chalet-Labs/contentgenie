import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExpandable } from "@/hooks/use-expandable";

describe("useExpandable", () => {
  it("collapsed by default — returns first `initial` items and hides no expansion count", () => {
    const items = [1, 2, 3, 4, 5];
    const { result } = renderHook(() => useExpandable(items, 3));
    expect(result.current.visible).toEqual([1, 2, 3]);
    expect(result.current.expanded).toBe(false);
    expect(result.current.hiddenCount).toBe(2);
    expect(result.current.shouldShowToggle).toBe(true);
  });

  it("toggle() flips expanded state and reveals the full list", () => {
    const items = [1, 2, 3, 4, 5];
    const { result } = renderHook(() => useExpandable(items, 3));

    act(() => result.current.toggle());
    expect(result.current.expanded).toBe(true);
    expect(result.current.visible).toEqual([1, 2, 3, 4, 5]);

    act(() => result.current.toggle());
    expect(result.current.expanded).toBe(false);
    expect(result.current.visible).toEqual([1, 2, 3]);
  });

  it("shouldShowToggle is false at the N > N boundary (exactly initial items)", () => {
    const { result } = renderHook(() => useExpandable([1, 2, 3], 3));
    expect(result.current.shouldShowToggle).toBe(false);
    expect(result.current.hiddenCount).toBe(0);
  });

  it("shouldShowToggle is false when items.length < initial, and hiddenCount stays at 0 (not negative)", () => {
    const { result } = renderHook(() => useExpandable([1, 2], 5));
    expect(result.current.shouldShowToggle).toBe(false);
    expect(result.current.hiddenCount).toBe(0);
    expect(result.current.visible).toEqual([1, 2]);
  });

  it("hiddenCount equals items.length - initial when over threshold", () => {
    const { result } = renderHook(() => useExpandable(Array.from({ length: 10 }), 3));
    expect(result.current.hiddenCount).toBe(7);
  });

  it("toggle identity is stable across renders (safe for memoized children)", () => {
    const { result, rerender } = renderHook(({ items }) => useExpandable(items, 3), {
      initialProps: { items: [1, 2, 3, 4] },
    });
    const first = result.current.toggle;
    rerender({ items: [1, 2, 3, 4, 5] });
    expect(result.current.toggle).toBe(first);
  });
});
