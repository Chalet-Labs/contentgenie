import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// We need to control what usePathname returns per test
let mockPathname = "/";
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

import { usePwaInstall } from "@/hooks/use-pwa-install";

function createMockMatchMedia(overrides: Record<string, boolean> = {}) {
  return (query: string): MediaQueryList => ({
    matches: overrides[query] ?? false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

function fireBeforeInstallPrompt(): BeforeInstallPromptEvent {
  const promptMock = vi.fn().mockResolvedValue(undefined);
  const userChoiceMock = Promise.resolve({
    outcome: "accepted" as const,
  });
  const event = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
  Object.defineProperty(event, "prompt", { value: promptMock });
  Object.defineProperty(event, "userChoice", { value: userChoiceMock });
  Object.defineProperty(event, "platforms", { value: ["web"] });
  window.dispatchEvent(event);
  return event;
}

// Simple in-memory localStorage mock that has all standard methods
function createLocalStorageMock(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key];
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

describe("usePwaInstall", () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    vi.useFakeTimers();
    mockPathname = "/";
    originalMatchMedia = window.matchMedia;

    // Install a proper localStorage mock
    Object.defineProperty(window, "localStorage", {
      value: createLocalStorageMock(),
      writable: true,
      configurable: true,
    });

    // Default: not standalone, is mobile
    window.matchMedia = createMockMatchMedia({
      "(max-width: 767px)": true,
      "(display-mode: standalone)": false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.matchMedia = originalMatchMedia;
  });

  it("returns canInstall: false when no beforeinstallprompt fired", () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canInstall).toBe(false);
  });

  it("returns isInstalled: true when display-mode: standalone matches", () => {
    window.matchMedia = createMockMatchMedia({
      "(display-mode: standalone)": true,
      "(max-width: 767px)": true,
    });

    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isInstalled).toBe(true);
  });

  it("returns isInstalled: true when navigator.standalone is true", () => {
    Object.defineProperty(navigator, "standalone", {
      value: true,
      configurable: true,
      writable: true,
    });

    try {
      const { result } = renderHook(() => usePwaInstall());
      expect(result.current.isInstalled).toBe(true);
    } finally {
      Object.defineProperty(navigator, "standalone", {
        value: undefined,
        configurable: true,
        writable: true,
      });
    }
  });

  it("returns isInstalled: true reactively when appinstalled fires", () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isInstalled).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(result.current.isInstalled).toBe(true);
  });

  it("returns canInstall: false when dismissed within 7 days", () => {
    window.localStorage.setItem(
      "pwa-install-dismissed",
      String(Date.now()),
    );

    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      fireBeforeInstallPrompt();
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.canInstall).toBe(false);
  });

  it("returns canInstall: false before engagement threshold met", () => {
    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(result.current.canInstall).toBe(false);
  });

  it("returns canInstall: true after visiting 2 unique paths", () => {
    mockPathname = "/page1";
    const { result, rerender } = renderHook(() => usePwaInstall());

    act(() => {
      fireBeforeInstallPrompt();
    });

    mockPathname = "/page2";
    rerender();

    expect(result.current.canInstall).toBe(true);
  });

  it("returns canInstall: true after 30 seconds", () => {
    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      fireBeforeInstallPrompt();
    });

    expect(result.current.canInstall).toBe(false);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.canInstall).toBe(true);
  });

  it("promptInstall() calls prompt() on the deferred event and returns true on accept", async () => {
    const { result } = renderHook(() => usePwaInstall());

    let mockEvent: BeforeInstallPromptEvent;
    act(() => {
      mockEvent = fireBeforeInstallPrompt();
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.promptInstall();
    });

    expect(mockEvent!.prompt).toHaveBeenCalledOnce();
    expect(accepted).toBe(true);
  });

  it("promptInstall() returns false after prompt ref is already null (no double-prompt)", async () => {
    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      fireBeforeInstallPrompt();
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    await act(async () => {
      await result.current.promptInstall();
    });

    let secondResult: boolean | undefined;
    await act(async () => {
      secondResult = await result.current.promptInstall();
    });

    expect(secondResult).toBe(false);
  });

  it("dismiss() writes to localStorage", () => {
    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      result.current.dismiss();
    });

    const stored = window.localStorage.getItem("pwa-install-dismissed");
    expect(stored).toBeTruthy();
    expect(Number(stored)).toBeGreaterThan(0);
  });

  it("dismiss() does not throw when localStorage is unavailable", () => {
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: () => {
          throw new DOMException("blocked");
        },
        setItem: () => {
          throw new DOMException("blocked");
        },
        removeItem: () => {
          throw new DOMException("blocked");
        },
        clear: vi.fn(),
        length: 0,
        key: () => null,
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      result.current.dismiss();
    });

    expect(result.current).toBeDefined();
  });

  it("returns canInstall: true regardless of viewport (presentation handled by components)", () => {
    window.matchMedia = createMockMatchMedia({
      "(max-width: 767px)": false,
      "(display-mode: standalone)": false,
    });

    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      fireBeforeInstallPrompt();
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current.canInstall).toBe(true);
  });

  it("cleans up event listeners on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => usePwaInstall());
    unmount();

    const removedEvents = removeSpy.mock.calls.map(([event]) => event);
    expect(removedEvents).toContain("beforeinstallprompt");
    expect(removedEvents).toContain("appinstalled");
  });
});
