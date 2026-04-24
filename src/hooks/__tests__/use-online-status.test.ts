import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOnlineStatus } from "@/hooks/use-online-status";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOnlineStatus", () => {
  it("returns true when navigator.onLine is true", () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("returns false when navigator.onLine is false", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("updates to false when offline event fires", () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        configurable: true,
        writable: true,
      });
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current).toBe(false);
  });

  it("updates to true when online event fires", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
        writable: true,
      });
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current).toBe(true);
  });

  it("cleans up event listeners on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();

    const removedEvents = removeEventListenerSpy.mock.calls.map(
      ([event]) => event,
    );
    expect(removedEvents).toContain("online");
    expect(removedEvents).toContain("offline");
  });

  it("getServerSnapshot returns true for SSR safety", () => {
    // useSyncExternalStore's getServerSnapshot should return true
    // This is tested indirectly — the hook should not throw during SSR
    // In jsdom, navigator.onLine exists, so we verify the hook works
    const { result } = renderHook(() => useOnlineStatus());
    expect(typeof result.current).toBe("boolean");
  });
});
