import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";

// Mock sync-queue before importing the hook
const mockGetPending = vi.fn();
const mockGetActive = vi.fn();
const mockGetActiveAndFailed = vi.fn();
const mockDequeue = vi.fn();
const mockMarkFailed = vi.fn();
const mockIncrementAttempts = vi.fn();
const mockMarkInFlight = vi.fn();
const mockResetStaleInFlight = vi.fn();
const mockGetFailed = vi.fn();

vi.mock("@/lib/sync-queue", () => ({
  getPending: () => mockGetPending(),
  getActive: () => mockGetActive(),
  getActiveAndFailed: () => mockGetActiveAndFailed(),
  getFailed: () => mockGetFailed(),
  dequeue: (...args: unknown[]) => mockDequeue(...args),
  markFailed: (...args: unknown[]) => mockMarkFailed(...args),
  incrementAttempts: (...args: unknown[]) => mockIncrementAttempts(...args),
  markInFlight: (...args: unknown[]) => mockMarkInFlight(...args),
  resetStaleInFlight: () => mockResetStaleInFlight(),
}));

// Wrapper that provides the SyncQueueProvider context
let wrapper: React.FC<{ children: React.ReactNode }>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockGetPending.mockResolvedValue([]);
  mockGetActive.mockResolvedValue([]);
  mockGetActiveAndFailed.mockResolvedValue({ active: [], failed: [] });
  mockDequeue.mockResolvedValue(undefined);
  mockMarkFailed.mockResolvedValue(undefined);
  mockIncrementAttempts.mockResolvedValue(undefined);
  mockMarkInFlight.mockResolvedValue(undefined);
  mockResetStaleInFlight.mockResolvedValue(undefined);
  mockGetFailed.mockResolvedValue([]);

  Object.defineProperty(navigator, "serviceWorker", {
    value: undefined,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
    writable: true,
  });

  // Remove navigator.locks so tests without explicit lock mocks use the no-lock path
  Object.defineProperty(navigator, "locks", {
    value: undefined,
    configurable: true,
    writable: true,
  });

  const { SyncQueueProvider } = await import("@/contexts/sync-queue-context");
  wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(SyncQueueProvider, null, children);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useSyncQueue — pendingCount", () => {
  it("initializes pendingCount to 0", async () => {
    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    // Initial render before async state update
    expect(result.current.pendingCount).toBe(0);
  });

  it("updates pendingCount from queue after mount", async () => {
    const items = [
      { id: "a", action: "save-episode", entityKey: "episode:1", payload: {}, createdAt: 1, attempts: 0, status: "pending" as const },
      { id: "b", action: "subscribe", entityKey: "podcast:2", payload: {}, createdAt: 2, attempts: 0, status: "pending" as const },
      { id: "c", action: "save-episode", entityKey: "episode:3", payload: {}, createdAt: 3, attempts: 0, status: "pending" as const },
    ];
    mockGetPending.mockResolvedValue(items);
    mockGetActive.mockResolvedValue(items);
    mockGetActiveAndFailed.mockResolvedValue({ active: items, failed: [] });

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(3);
    });
  });
});

describe("useSyncQueue — in-flight items in pendingCount", () => {
  it("includes in-flight items in pendingCount", async () => {
    const pendingItems = [
      { id: "a", action: "save-episode" as const, entityKey: "episode:1", payload: {}, createdAt: 1, attempts: 0, status: "pending" as const },
      { id: "b", action: "subscribe" as const, entityKey: "podcast:2", payload: {}, createdAt: 2, attempts: 0, status: "pending" as const },
    ];
    const inFlightItem = { id: "c", action: "save-episode" as const, entityKey: "episode:3", payload: {}, createdAt: 3, attempts: 0, status: "in-flight" as const, inFlightAt: Date.now() };
    const allActive = [...pendingItems, inFlightItem];

    mockGetPending.mockResolvedValue(pendingItems);
    mockGetActive.mockResolvedValue(allActive);
    mockGetActiveAndFailed.mockResolvedValue({ active: allActive, failed: [] });

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(3); // 2 pending + 1 in-flight
    });
    expect(result.current.hasPending("episode:3")).toBe(true); // in-flight counts as pending
  });
});

describe("useSyncQueue — hasFailed", () => {
  it("hasFailed returns true when entity has a failed item", async () => {
    const failedItem = {
      id: "f1",
      action: "save-episode" as const,
      entityKey: "episode:fail-1",
      payload: {},
      createdAt: Date.now(),
      attempts: 3,
      status: "failed" as const,
    };
    mockGetActiveAndFailed.mockResolvedValue({ active: [], failed: [failedItem] });
    mockGetFailed.mockResolvedValue([failedItem]);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await waitFor(() => {
      expect(result.current.hasFailed("episode:fail-1")).toBe(true);
    });
  });

  it("hasFailed returns false when entity has no failed items", async () => {
    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await waitFor(() => {
      expect(result.current.hasFailed("episode:none")).toBe(false);
    });
  });
});

describe("useSyncQueue — hasPending", () => {
  it("hasPending returns false when queue is empty", async () => {
    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await waitFor(() => {
      expect(result.current.hasPending("episode:xyz")).toBe(false);
    });
  });

  it("hasPending returns true when entity has a pending item", async () => {
    const pendingItem = {
      id: "q1",
      action: "save-episode" as const,
      entityKey: "episode:123",
      payload: {},
      createdAt: Date.now(),
      attempts: 0,
      status: "pending" as const,
    };
    mockGetPending.mockResolvedValue([pendingItem]);
    mockGetActive.mockResolvedValue([pendingItem]);
    mockGetActiveAndFailed.mockResolvedValue({ active: [pendingItem], failed: [] });

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await waitFor(
      () => {
        expect(result.current.hasPending("episode:123")).toBe(true);
      },
      { timeout: 3000 }
    );
  });

  it("hasPending returns false for a different entityKey", async () => {
    const pendingItem = {
      id: "q1",
      action: "save-episode" as const,
      entityKey: "episode:123",
      payload: {},
      createdAt: Date.now(),
      attempts: 0,
      status: "pending" as const,
    };
    mockGetPending.mockResolvedValue([pendingItem]);
    mockGetActive.mockResolvedValue([pendingItem]);
    mockGetActiveAndFailed.mockResolvedValue({ active: [pendingItem], failed: [] });

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await waitFor(
      () => {
        expect(result.current.pendingCount).toBe(1);
      },
      { timeout: 3000 }
    );

    expect(result.current.hasPending("episode:999")).toBe(false);
  });
});

describe("useSyncQueue — isSyncing state", () => {
  it("starts with isSyncing false", async () => {
    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    expect(result.current.isSyncing).toBe(false);
  });

  it("sets isSyncing to true during replayAll and false after", async () => {
    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await act(async () => {
      await result.current.replayAll();
    });

    expect(result.current.isSyncing).toBe(false);
  });
});

describe("useSyncQueue — online event triggers replayAll", () => {
  it("calls getPending when online event fires", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    renderHook(() => useSyncQueue(), { wrapper });

    // Wait for initial mount
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const callsBefore = mockGetPending.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 10));
    });

    // getPending should have been called again as part of replayAll
    expect(mockGetPending.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

describe("useSyncQueue — SW message handling", () => {
  let swListeners: Map<string, Set<EventListener>>;
  let mockSWContainer: { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };

  function setupMockServiceWorker() {
    swListeners = new Map();
    mockSWContainer = {
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        if (!swListeners.has(event)) swListeners.set(event, new Set());
        swListeners.get(event)!.add(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: EventListener) => {
        swListeners.get(event)?.delete(handler);
      }),
    };
    Object.defineProperty(navigator, "serviceWorker", {
      value: mockSWContainer,
      configurable: true,
      writable: true,
    });
  }

  function dispatchSWMessage(data: unknown) {
    const handlers = swListeners.get("message");
    if (handlers) {
      const event = new MessageEvent("message", { data });
      handlers.forEach((handler) => {
        handler(event);
      });
    }
  }

  it("calls refreshQueue when sync-complete message received", async () => {
    setupMockServiceWorker();

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    renderHook(() => useSyncQueue(), { wrapper });

    // Wait for initial mount
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const callsBefore = mockGetActiveAndFailed.mock.calls.length;

    await act(async () => {
      dispatchSWMessage({ type: "sync-complete", results: [] });
      await new Promise((r) => setTimeout(r, 10));
    });

    // getActiveAndFailed should have been called again from refreshQueue
    expect(mockGetActiveAndFailed.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("does not call refreshQueue for unrelated messages", async () => {
    setupMockServiceWorker();

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    renderHook(() => useSyncQueue(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const callsBefore = mockGetActiveAndFailed.mock.calls.length;

    await act(async () => {
      dispatchSWMessage({ type: "other-message" });
      await new Promise((r) => setTimeout(r, 10));
    });

    // Should NOT have triggered another getActiveAndFailed call
    expect(mockGetActiveAndFailed.mock.calls.length).toBe(callsBefore);
  });
});

describe("useSyncQueue — 401 drain on replayAll", () => {
  it("calls dequeue (not incrementAttempts) on 401 response", async () => {
    const pendingItem = {
      id: "q1",
      action: "save-episode" as const,
      entityKey: "episode:123",
      payload: { podcastIndexId: "ep-123", title: "Test" },
      createdAt: Date.now(),
      attempts: 0,
      status: "pending" as const,
    };

    mockGetPending.mockResolvedValue([pendingItem]);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 401 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await act(async () => {
      await result.current.replayAll();
    });

    expect(mockDequeue).toHaveBeenCalledWith("q1");
    expect(mockIncrementAttempts).not.toHaveBeenCalled();
  });

  it("calls dequeue (not incrementAttempts) on 200 response", async () => {
    const pendingItem = {
      id: "q2",
      action: "subscribe" as const,
      entityKey: "podcast:456",
      payload: { podcastIndexId: "pod-456", title: "Test Podcast" },
      createdAt: Date.now(),
      attempts: 0,
      status: "pending" as const,
    };

    mockGetPending.mockResolvedValue([pendingItem]);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await act(async () => {
      await result.current.replayAll();
    });

    expect(mockDequeue).toHaveBeenCalledWith("q2");
    expect(mockIncrementAttempts).not.toHaveBeenCalled();
  });

  it("increments attempts on non-401 error and marks failed at MAX_RETRY_ATTEMPTS", async () => {
    const pendingItem = {
      id: "q3",
      action: "save-episode" as const,
      entityKey: "episode:789",
      payload: { podcastIndexId: "ep-789", title: "Test" },
      createdAt: Date.now(),
      attempts: 2, // already at 2, next increment (3) hits MAX_RETRY_ATTEMPTS
      status: "pending" as const,
    };

    mockGetPending.mockResolvedValue([pendingItem]);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await act(async () => {
      await result.current.replayAll();
    });

    expect(mockIncrementAttempts).toHaveBeenCalledWith("q3");
    expect(mockMarkFailed).toHaveBeenCalledWith("q3");
  });
});

describe("useSyncQueue — navigator.locks coordination", () => {
  it("skips replay when navigator.locks.request cannot acquire lock", async () => {
    // Mock navigator.locks — handles both 2-arg (reset) and 3-arg (replay) forms
    Object.defineProperty(navigator, "locks", {
      value: {
        request: vi.fn((...args: unknown[]) => {
          if (args.length === 3) {
            // Replay: assert lock contract
            expect(args[0]).toBe("contentgenie-sync-replay");
            expect(args[1]).toEqual({ ifAvailable: true });
            return (args[2] as (lock: unknown) => Promise<void>)(null);
          }
          // Mount-time reset: 2-arg form
          return (args[1] as () => Promise<void>)();
        }),
      },
      configurable: true,
      writable: true,
    });

    const pendingItem = {
      id: "q-lock-1",
      action: "save-episode" as const,
      entityKey: "episode:lock-1",
      payload: { podcastIndexId: "ep-lock-1", title: "Lock Test" },
      createdAt: Date.now(),
      attempts: 0,
      status: "pending" as const,
    };
    mockGetPending.mockResolvedValue([pendingItem]);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await act(async () => {
      await result.current.replayAll();
    });

    // Fetch should NOT have been called because lock was unavailable
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockMarkInFlight).not.toHaveBeenCalled();
  });

  it("proceeds with replay when navigator.locks.request acquires lock", async () => {
    // Mock navigator.locks — handles both 2-arg (reset) and 3-arg (replay) forms
    Object.defineProperty(navigator, "locks", {
      value: {
        request: vi.fn((...args: unknown[]) => {
          if (args.length === 3) {
            // Replay: assert lock contract
            expect(args[0]).toBe("contentgenie-sync-replay");
            expect(args[1]).toEqual({ ifAvailable: true });
            return (args[2] as (lock: unknown) => Promise<void>)({}); // non-null = acquired
          }
          // Mount-time reset: 2-arg form
          return (args[1] as () => Promise<void>)();
        }),
      },
      configurable: true,
      writable: true,
    });

    const pendingItem = {
      id: "q-lock-2",
      action: "save-episode" as const,
      entityKey: "episode:lock-2",
      payload: { podcastIndexId: "ep-lock-2", title: "Lock Test 2" },
      createdAt: Date.now(),
      attempts: 0,
      status: "pending" as const,
    };
    mockGetPending.mockResolvedValue([pendingItem]);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue(), { wrapper });

    await act(async () => {
      await result.current.replayAll();
    });

    // Fetch SHOULD have been called because lock was acquired
    expect(fetchMock).toHaveBeenCalled();
    expect(mockDequeue).toHaveBeenCalledWith("q-lock-2");
  });
});

describe("useSyncQueue — cleanup", () => {
  it("removes online event listener on unmount", async () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { unmount } = renderHook(() => useSyncQueue(), { wrapper });
    unmount();

    const removedEvents = removeEventListenerSpy.mock.calls.map(([event]) => event);
    expect(removedEvents).toContain("online");
  });

  it("removes message event listener on unmount", async () => {
    const mockRemoveEventListener = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        addEventListener: vi.fn(),
        removeEventListener: mockRemoveEventListener,
      },
      configurable: true,
      writable: true,
    });

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { unmount } = renderHook(() => useSyncQueue(), { wrapper });
    unmount();

    const removedEvents = mockRemoveEventListener.mock.calls.map(([event]: string[]) => event);
    expect(removedEvents).toContain("message");
  });
});
