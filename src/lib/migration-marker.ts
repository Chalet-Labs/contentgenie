/**
 * Per-user localStorage migration markers for the cross-device sync feature.
 * See ADR-036. Once a user has successfully reconciled with the server, the
 * "server-empty" state is authoritative: without a marker, a queue cleared on
 * Device A could be resurrected by Device B's stale localStorage on its next
 * mount.
 *
 * Also tracks the last signed-in user to wipe stale localStorage when a
 * different user signs in on the same browser (otherwise User A's cached
 * queue would leak into User B's account on B's first sync).
 */

const QUEUE_MIGRATED_PREFIX = "contentgenie-queue-migrated-";
const SESSION_MIGRATED_PREFIX = "contentgenie-session-migrated-";
const LAST_USER_ID_KEY = "contentgenie-last-user-id";

const QUEUE_STORAGE_KEY = "contentgenie-player-queue";
const SESSION_STORAGE_KEY = "contentgenie-player-session";

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, val: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, val);
  } catch {
    // localStorage unavailable (private mode / quota exceeded) — ignore.
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function hasQueueMigrated(userId: string): boolean {
  return safeGet(QUEUE_MIGRATED_PREFIX + userId) === "1";
}

export function markQueueMigrated(userId: string): void {
  safeSet(QUEUE_MIGRATED_PREFIX + userId, "1");
}

export function hasSessionMigrated(userId: string): boolean {
  return safeGet(SESSION_MIGRATED_PREFIX + userId) === "1";
}

export function markSessionMigrated(userId: string): void {
  safeSet(SESSION_MIGRATED_PREFIX + userId, "1");
}

export function getLastUserId(): string | null {
  return safeGet(LAST_USER_ID_KEY);
}

export function setLastUserId(userId: string): void {
  safeSet(LAST_USER_ID_KEY, userId);
}

/**
 * Wipes the queue cache, session cache, last-user-id, and every per-user
 * migration marker. Called when a different user signs in on the same browser
 * so we don't carry the previous user's data into the new account.
 */
export function clearAllUserLocalData(): void {
  if (typeof window === "undefined") return;
  try {
    safeRemove(QUEUE_STORAGE_KEY);
    safeRemove(SESSION_STORAGE_KEY);
    safeRemove(LAST_USER_ID_KEY);
    // Remove all per-user migration markers — iterate in reverse since
    // removeItem mutates localStorage.length.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith(QUEUE_MIGRATED_PREFIX) ||
        key.startsWith(SESSION_MIGRATED_PREFIX)
      ) {
        safeRemove(key);
      }
    }
  } catch {
    // ignore
  }
}
