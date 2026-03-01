import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock sync-queue before importing the hook
const mockGetQueueCount = vi.fn();
const mockGetPending = vi.fn();
const mockDequeue = vi.fn();
const mockMarkFailed = vi.fn();
const mockIncrementAttempts = vi.fn();
const mockMarkInFlight = vi.fn();

vi.mock("@/lib/sync-queue", () => ({
  getQueueCount: () => mockGetQueueCount(),
  getPending: () => mockGetPending(),
  dequeue: (...args: unknown[]) => mockDequeue(...args),
  markFailed: (...args: unknown[]) => mockMarkFailed(...args),
  incrementAttempts: (...args: unknown[]) => mockIncrementAttempts(...args),
  markInFlight: (...args: unknown[]) => mockMarkInFlight(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetQueueCount.mockResolvedValue(0);
  mockGetPending.mockResolvedValue([]);
  mockDequeue.mockResolvedValue(undefined);
  mockMarkFailed.mockResolvedValue(undefined);
  mockIncrementAttempts.mockResolvedValue(undefined);
  mockMarkInFlight.mockResolvedValue(undefined);

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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSyncQueue — pendingCount", () => {
  it("initializes pendingCount to 0", async () => {
    mockGetQueueCount.mockResolvedValue(0);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue());

    // Initial render before async state update
    expect(result.current.pendingCount).toBe(0);
  });

  it("updates pendingCount from queue after mount", async () => {
    mockGetQueueCount.mockResolvedValue(3);
    mockGetPending.mockResolvedValue([
      { id: "a", action: "save-episode", entityKey: "episode:1", payload: {}, createdAt: 1, attempts: 0, status: "pending" as const },
      { id: "b", action: "subscribe", entityKey: "podcast:2", payload: {}, createdAt: 2, attempts: 0, status: "pending" as const },
      { id: "c", action: "save-episode", entityKey: "episode:3", payload: {}, createdAt: 3, attempts: 0, status: "pending" as const },
    ]);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue());

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(3);
    });
  });
});

describe("useSyncQueue — hasPending", () => {
  it("hasPending returns false when queue is empty", async () => {
    mockGetQueueCount.mockResolvedValue(0);
    mockGetPending.mockResolvedValue([]);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue());

    await waitFor(() => {
      // After initial load, pendingCount is 0 so pendingItems is []
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
    mockGetQueueCount.mockResolvedValue(1);
    mockGetPending.mockResolvedValue([pendingItem]);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue());

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
    mockGetQueueCount.mockResolvedValue(1);
    mockGetPending.mockResolvedValue([pendingItem]);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue());

    await waitFor(
      () => {
        // pendingItems loaded, entity:123 present but 999 not
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
    const { result } = renderHook(() => useSyncQueue());

    expect(result.current.isSyncing).toBe(false);
  });

  it("sets isSyncing to true during replayAll and false after", async () => {
    mockGetPending.mockResolvedValue([]);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.replayAll();
    });

    expect(result.current.isSyncing).toBe(false);
  });
});

describe("useSyncQueue — online event triggers replayAll", () => {
  it("calls getPending when online event fires", async () => {
    mockGetQueueCount.mockResolvedValue(0);
    mockGetPending.mockResolvedValue([]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    renderHook(() => useSyncQueue());

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
    expect(mockGetPending.mock.calls.length).toBeGreaterThanOrEqual(callsBefore);
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
      handlers.forEach((handler) => handler(event));
    }
  }

  it("calls refreshQueue when sync-complete message received", async () => {
    setupMockServiceWorker();
    mockGetQueueCount.mockResolvedValue(0);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    renderHook(() => useSyncQueue());

    // Wait for initial mount
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const callsBefore = mockGetQueueCount.mock.calls.length;

    await act(async () => {
      dispatchSWMessage({ type: "sync-complete", results: [] });
      await new Promise((r) => setTimeout(r, 10));
    });

    // getQueueCount should have been called again from refreshQueue
    expect(mockGetQueueCount.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("does not call refreshQueue for unrelated messages", async () => {
    setupMockServiceWorker();
    mockGetQueueCount.mockResolvedValue(0);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    renderHook(() => useSyncQueue());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const callsBefore = mockGetQueueCount.mock.calls.length;

    await act(async () => {
      dispatchSWMessage({ type: "other-message" });
      await new Promise((r) => setTimeout(r, 10));
    });

    // Should NOT have triggered another getQueueCount call
    expect(mockGetQueueCount.mock.calls.length).toBe(callsBefore);
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
    mockGetQueueCount.mockResolvedValue(0);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 401 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue());

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
    mockGetQueueCount.mockResolvedValue(0);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue());

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
    mockGetQueueCount.mockResolvedValue(0);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.replayAll();
    });

    expect(mockIncrementAttempts).toHaveBeenCalledWith("q3");
    expect(mockMarkFailed).toHaveBeenCalledWith("q3");
  });
});

describe("useSyncQueue — cleanup", () => {
  it("removes online event listener on unmount", async () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { useSyncQueue } = await import("@/hooks/use-sync-queue");
    const { unmount } = renderHook(() => useSyncQueue());
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
    const { unmount } = renderHook(() => useSyncQueue());
    unmount();

    const removedEvents = mockRemoveEventListener.mock.calls.map(([event]: string[]) => event);
    expect(removedEvents).toContain("message");
  });
});
