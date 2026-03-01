import { get, set, del, entries, clear, createStore } from "idb-keyval";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_QUEUE_SIZE = 100;

// ─── Custom Store ─────────────────────────────────────────────────────────────
// SEPARATE database from contentgenie-offline (idb-keyval cannot share DB names)

const store = createStore("contentgenie-offline-queue", "actions");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncQueueItem {
  id: string;
  action: "save-episode" | "unsave-episode" | "subscribe" | "unsubscribe";
  entityKey: string; // dedup key, e.g. "episode:12345" or "podcast:67890"
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  status: "pending" | "in-flight" | "failed";
}

type SyncAction = SyncQueueItem["action"];

// Opposite action pairs for deduplication
const OPPOSITE_ACTIONS: Record<SyncAction, SyncAction> = {
  "save-episode": "unsave-episode",
  "unsave-episode": "save-episode",
  subscribe: "unsubscribe",
  unsubscribe: "subscribe",
};

// ─── Internal state ───────────────────────────────────────────────────────────

let _idbAvailable: boolean | null = null;

// ─── Availability probe ───────────────────────────────────────────────────────

async function isIdbAvailable(): Promise<boolean> {
  if (_idbAvailable !== null) return _idbAvailable;

  try {
    await set("__probe", 1, store);
    await del("__probe", store);
    _idbAvailable = true;
  } catch {
    _idbAvailable = false;
  }

  return _idbAvailable;
}

// ─── Queue CRUD ───────────────────────────────────────────────────────────────

/**
 * Enqueue a sync action. If an opposite action for the same entityKey is
 * already pending, dequeue it and return null (net cancel).
 */
export async function enqueue(
  item: Omit<SyncQueueItem, "id" | "createdAt" | "attempts" | "status">,
): Promise<string | null> {
  if (!(await isIdbAvailable())) return null;

  // Dedup: check for opposite pending action on same entity
  const opposite = OPPOSITE_ACTIONS[item.action];
  const allEntries = await entries<string, SyncQueueItem>(store);

  for (const [key, value] of allEntries) {
    if (
      value.entityKey === item.entityKey &&
      value.action === opposite &&
      value.status === "pending"
    ) {
      // Cancel opposite action — net zero
      await del(key, store);
      return null;
    }
  }

  // Enforce queue cap
  const pendingCount = allEntries.filter(
    ([, v]) => v.status === "pending",
  ).length;
  if (pendingCount >= MAX_QUEUE_SIZE) {
    // Evict oldest pending item
    const oldest = allEntries
      .filter(([, v]) => v.status === "pending")
      .sort(([, a], [, b]) => a.createdAt - b.createdAt)[0];
    if (oldest) {
      await del(oldest[0], store);
    }
  }

  const id = crypto.randomUUID();
  const queueItem: SyncQueueItem = {
    ...item,
    id,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  };

  await set(id, queueItem, store);
  return id;
}

export async function dequeue(id: string): Promise<void> {
  if (!(await isIdbAvailable())) return;
  await del(id, store);
}

export async function dequeueByEntityKey(entityKey: string): Promise<void> {
  if (!(await isIdbAvailable())) return;

  const allEntries = await entries<string, SyncQueueItem>(store);
  for (const [key, value] of allEntries) {
    if (value.entityKey === entityKey) {
      await del(key, store);
    }
  }
}

export async function getPending(): Promise<SyncQueueItem[]> {
  if (!(await isIdbAvailable())) return [];

  const allEntries = await entries<string, SyncQueueItem>(store);
  return allEntries
    .map(([, value]) => value)
    .filter((item) => item.status === "pending")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function markInFlight(id: string): Promise<void> {
  if (!(await isIdbAvailable())) return;

  const item = await get<SyncQueueItem>(id, store);
  if (!item) return;

  await set(id, { ...item, status: "in-flight" as const }, store);
}

export async function markFailed(id: string): Promise<void> {
  if (!(await isIdbAvailable())) return;

  const item = await get<SyncQueueItem>(id, store);
  if (!item) return;

  await set(id, { ...item, status: "failed" as const }, store);
}

export async function incrementAttempts(id: string): Promise<void> {
  if (!(await isIdbAvailable())) return;

  const item = await get<SyncQueueItem>(id, store);
  if (!item) return;

  await set(id, { ...item, attempts: item.attempts + 1, status: "pending" as const }, store);
}

export async function getQueueCount(): Promise<number> {
  if (!(await isIdbAvailable())) return 0;

  const allEntries = await entries<string, SyncQueueItem>(store);
  return allEntries.filter(([, v]) => v.status === "pending" || v.status === "in-flight").length;
}

export async function hasPendingAction(entityKey: string): Promise<boolean> {
  if (!(await isIdbAvailable())) return false;

  const allEntries = await entries<string, SyncQueueItem>(store);
  return allEntries.some(
    ([, v]) => v.entityKey === entityKey && (v.status === "pending" || v.status === "in-flight"),
  );
}

export async function clearFailed(): Promise<void> {
  if (!(await isIdbAvailable())) return;

  const allEntries = await entries<string, SyncQueueItem>(store);
  for (const [key, value] of allEntries) {
    if (value.status === "failed") {
      await del(key, store);
    }
  }
}

// ─── Testing helpers ──────────────────────────────────────────────────────────

export async function _resetForTesting(): Promise<void> {
  _idbAvailable = null;
  try {
    await clear(store);
  } catch {
    // Store may not exist yet during initial setup
  }
}
