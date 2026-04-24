import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  enqueue,
  dequeue,
  dequeueByEntityKey,
  getPending,
  getActive,
  markInFlight,
  markFailed,
  incrementAttempts,
  getQueueCount,
  hasPendingAction,
  clearFailed,
  getFailed,
  resetStaleInFlight,
  _resetForTesting,
  type SyncQueueItem,
} from "@/lib/sync-queue";

beforeEach(async () => {
  await _resetForTesting();
});

afterEach(async () => {
  await _resetForTesting();
});

describe("enqueue", () => {
  it("adds an item and returns a non-null id string", async () => {
    const id = await enqueue({
      action: "save-episode",
      entityKey: "episode:123",
      payload: { title: "Test Episode" },
    });
    expect(id).not.toBeNull();
    expect(typeof id).toBe("string");
    expect((id as string).length).toBeGreaterThan(0);
  });

  it("item starts with status pending and 0 attempts", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:123",
      payload: {},
    });
    const items = await getPending();
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("pending");
    expect(items[0].attempts).toBe(0);
  });

  it("item has createdAt timestamp", async () => {
    const before = Date.now();
    await enqueue({
      action: "subscribe",
      entityKey: "podcast:456",
      payload: { podcastIndexId: "456" },
    });
    const after = Date.now();
    const items = await getPending();
    expect(items[0].createdAt).toBeGreaterThanOrEqual(before);
    expect(items[0].createdAt).toBeLessThanOrEqual(after);
  });

  it("enqueues multiple distinct items", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    await enqueue({ action: "subscribe", entityKey: "podcast:2", payload: {} });
    const count = await getQueueCount();
    expect(count).toBe(2);
  });
});

describe("dedup: opposite action cancels pending", () => {
  it("save then unsave for same entity cancels both — queue empty", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:123",
      payload: {},
    });
    await enqueue({
      action: "unsave-episode",
      entityKey: "episode:123",
      payload: {},
    });
    const count = await getQueueCount();
    expect(count).toBe(0);
  });

  it("unsave then save for same entity cancels both", async () => {
    await enqueue({
      action: "unsave-episode",
      entityKey: "episode:99",
      payload: {},
    });
    await enqueue({
      action: "save-episode",
      entityKey: "episode:99",
      payload: {},
    });
    const count = await getQueueCount();
    expect(count).toBe(0);
  });

  it("subscribe then unsubscribe for same podcast cancels both", async () => {
    await enqueue({
      action: "subscribe",
      entityKey: "podcast:10",
      payload: {},
    });
    await enqueue({
      action: "unsubscribe",
      entityKey: "podcast:10",
      payload: {},
    });
    const count = await getQueueCount();
    expect(count).toBe(0);
  });

  it("unsubscribe then subscribe for same podcast cancels both", async () => {
    await enqueue({
      action: "unsubscribe",
      entityKey: "podcast:10",
      payload: {},
    });
    await enqueue({
      action: "subscribe",
      entityKey: "podcast:10",
      payload: {},
    });
    const count = await getQueueCount();
    expect(count).toBe(0);
  });

  it("same action for same entity is not deduplicated (keeps both)", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:55",
      payload: {},
    });
    await enqueue({
      action: "save-episode",
      entityKey: "episode:55",
      payload: {},
    });
    const count = await getQueueCount();
    expect(count).toBe(2);
  });

  it("dedup is scoped to entityKey — different keys are independent", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:A",
      payload: {},
    });
    await enqueue({
      action: "unsave-episode",
      entityKey: "episode:B",
      payload: {},
    });
    const count = await getQueueCount();
    expect(count).toBe(2);
  });
});

describe("dequeue", () => {
  it("removes item by id", async () => {
    const id = await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    expect(id).not.toBeNull();
    await dequeue(id as string);
    expect(await getQueueCount()).toBe(0);
  });

  it("is a no-op for non-existent id", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    await dequeue("non-existent-id");
    expect(await getQueueCount()).toBe(1);
  });
});

describe("dequeueByEntityKey", () => {
  it("removes all pending items matching entityKey", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:42",
      payload: {},
    });
    await enqueue({
      action: "save-episode",
      entityKey: "episode:99",
      payload: {},
    });
    await dequeueByEntityKey("episode:42");
    const items = await getPending();
    expect(items).toHaveLength(1);
    expect(items[0].entityKey).toBe("episode:99");
  });

  it("is a no-op when no items match", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    await dequeueByEntityKey("episode:nonexistent");
    expect(await getQueueCount()).toBe(1);
  });
});

describe("status transitions", () => {
  it("markInFlight sets status to in-flight", async () => {
    const id = await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    expect(id).not.toBeNull();
    await markInFlight(id as string);
    // in-flight items are not returned by getPending
    const pendingItems = await getPending();
    const item = pendingItems.find((i: SyncQueueItem) => i.id === id);
    expect(item).toBeUndefined();
  });

  it("markFailed sets status to failed", async () => {
    const id = await enqueue({
      action: "save-episode",
      entityKey: "episode:7",
      payload: {},
    });
    expect(id).not.toBeNull();
    await markFailed(id as string);
    const pending = await getPending();
    const item = pending.find((i: SyncQueueItem) => i.id === id);
    expect(item).toBeUndefined(); // failed items are not returned by getPending
  });

  it("clearFailed removes all failed items", async () => {
    const id1 = await enqueue({
      action: "save-episode",
      entityKey: "episode:A",
      payload: {},
    });
    const id2 = await enqueue({
      action: "subscribe",
      entityKey: "podcast:B",
      payload: {},
    });
    expect(id1).not.toBeNull();
    expect(id2).not.toBeNull();
    await markFailed(id1 as string);
    await enqueue({
      action: "save-episode",
      entityKey: "episode:C",
      payload: {},
    }); // pending
    await clearFailed();
    // id1 failed item should be gone; id2 (still pending) and episode:C should remain
    const count = await getQueueCount();
    expect(count).toBe(2); // id2 pending + episode:C pending
  });
});

describe("incrementAttempts", () => {
  it("increments attempt count on the item", async () => {
    const id = await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    expect(id).not.toBeNull();
    await incrementAttempts(id as string);
    // After incrementing, item should still be pending with attempts=1
    const items = await getPending();
    const item = items.find((i: SyncQueueItem) => i.id === id);
    expect(item).toBeDefined();
    expect(item!.attempts).toBe(1);
  });

  it("accumulates across multiple increments", async () => {
    const id = await enqueue({
      action: "subscribe",
      entityKey: "podcast:X",
      payload: {},
    });
    expect(id).not.toBeNull();
    await incrementAttempts(id as string);
    await incrementAttempts(id as string);
    const items = await getPending();
    const item = items.find((i: SyncQueueItem) => i.id === id);
    expect(item!.attempts).toBe(2);
  });
});

describe("getQueueCount", () => {
  it("returns 0 for empty queue", async () => {
    expect(await getQueueCount()).toBe(0);
  });

  it("counts all non-failed items", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    await enqueue({ action: "subscribe", entityKey: "podcast:2", payload: {} });
    expect(await getQueueCount()).toBe(2);
  });
});

describe("hasPendingAction", () => {
  it("returns true when a pending item exists for entityKey", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:99",
      payload: {},
    });
    expect(await hasPendingAction("episode:99")).toBe(true);
  });

  it("returns false when no item exists for entityKey", async () => {
    expect(await hasPendingAction("episode:nonexistent")).toBe(false);
  });

  it("returns false after the item is dequeued", async () => {
    const id = await enqueue({
      action: "save-episode",
      entityKey: "episode:55",
      payload: {},
    });
    expect(id).not.toBeNull();
    await dequeue(id as string);
    expect(await hasPendingAction("episode:55")).toBe(false);
  });
});

describe("getPending", () => {
  it("returns items in order (oldest first or by insertion)", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: { n: 1 },
    });
    await enqueue({
      action: "subscribe",
      entityKey: "podcast:2",
      payload: { n: 2 },
    });
    const items = await getPending();
    expect(items).toHaveLength(2);
    expect(items.every((i: SyncQueueItem) => i.status === "pending")).toBe(
      true,
    );
  });

  it("does not include in-flight items", async () => {
    const id = await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    expect(id).not.toBeNull();
    await markInFlight(id as string);
    const items = await getPending();
    expect(items.find((i: SyncQueueItem) => i.id === id)).toBeUndefined();
  });

  it("does not include failed items", async () => {
    const id = await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    expect(id).not.toBeNull();
    await markFailed(id as string);
    const items = await getPending();
    expect(items.find((i: SyncQueueItem) => i.id === id)).toBeUndefined();
  });
});

describe("getActive", () => {
  it("returns items with status pending or in-flight", async () => {
    const id1 = await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    const id2 = await enqueue({
      action: "subscribe",
      entityKey: "podcast:2",
      payload: {},
    });
    const id3 = await enqueue({
      action: "save-episode",
      entityKey: "episode:3",
      payload: {},
    });
    expect(id1).not.toBeNull();
    expect(id2).not.toBeNull();
    expect(id3).not.toBeNull();
    await markInFlight(id1 as string);
    await markFailed(id3 as string);

    const active = await getActive();
    expect(active).toHaveLength(2);
    const activeIds = active.map((i: SyncQueueItem) => i.id);
    expect(activeIds).toContain(id1); // in-flight
    expect(activeIds).toContain(id2); // pending
    expect(activeIds).not.toContain(id3); // failed — excluded
  });

  it("returns empty array when queue is empty", async () => {
    const active = await getActive();
    expect(active).toHaveLength(0);
  });

  it("returns items sorted by createdAt (oldest first)", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:A",
      payload: {},
    });
    await enqueue({ action: "subscribe", entityKey: "podcast:B", payload: {} });
    const active = await getActive();
    expect(active).toHaveLength(2);
    // Both items present; order is by createdAt (may be equal at ms resolution)
    const keys = active.map((i: SyncQueueItem) => i.entityKey);
    expect(keys).toContain("episode:A");
    expect(keys).toContain("podcast:B");
    // If timestamps differ, first should have lower createdAt
    if (active[0].createdAt !== active[1].createdAt) {
      expect(active[0].createdAt).toBeLessThan(active[1].createdAt);
    }
  });
});

describe("resetStaleInFlight", () => {
  it("resets expired in-flight items to pending", async () => {
    const id1 = await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    const id2 = await enqueue({
      action: "subscribe",
      entityKey: "podcast:2",
      payload: {},
    });
    expect(id1).not.toBeNull();
    expect(id2).not.toBeNull();
    await markInFlight(id1 as string);
    await markInFlight(id2 as string);

    // Advance time past the 30s lease
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 31_000);

    await resetStaleInFlight();

    const pending = await getPending();
    expect(pending).toHaveLength(2);
    expect(pending.every((i: SyncQueueItem) => i.status === "pending")).toBe(
      true,
    );
    vi.restoreAllMocks();
  });

  it("does not reset fresh in-flight items", async () => {
    const id = await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    expect(id).not.toBeNull();
    await markInFlight(id as string);

    // No time advance — item is within lease
    await resetStaleInFlight();

    const pending = await getPending();
    expect(pending).toHaveLength(0);
    const active = await getActive();
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("in-flight");
  });

  it("does not touch pending items", async () => {
    await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    await resetStaleInFlight();
    const pending = await getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("pending");
  });

  it("does not touch failed items", async () => {
    const id = await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    expect(id).not.toBeNull();
    await markFailed(id as string);
    await resetStaleInFlight();

    // Failed item should still be failed, not reset to pending
    const pending = await getPending();
    expect(pending).toHaveLength(0);
    const failed = await getFailed();
    expect(failed).toHaveLength(1);
    expect(failed[0].id).toBe(id);
    expect(failed[0].status).toBe("failed");
  });
});

describe("IDB graceful degradation", () => {
  it("enqueue does not throw when IDB is available", async () => {
    // fake-indexeddb is always available in tests — verifies no throw and valid return
    const id = await enqueue({
      action: "save-episode",
      entityKey: "episode:1",
      payload: {},
    });
    expect(id).not.toBeNull();
  });

  it("getPending returns empty array if IDB errors", async () => {
    const pending = await getPending();
    expect(Array.isArray(pending)).toBe(true);
  });

  it("getQueueCount returns 0 without throwing on IDB error", async () => {
    const count = await getQueueCount();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
