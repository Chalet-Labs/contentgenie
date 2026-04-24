import { describe, it, expect, beforeEach } from "vitest";
import {
  clearAllUserLocalData,
  getLastUserId,
  hasQueueMigrated,
  hasSessionMigrated,
  markQueueMigrated,
  markSessionMigrated,
  setLastUserId,
} from "@/lib/migration-marker";
import { installLocalStorageMock } from "@/test/mocks/local-storage";

describe("migration-marker", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it("hasQueueMigrated returns false before markQueueMigrated", () => {
    expect(hasQueueMigrated("u1")).toBe(false);
    markQueueMigrated("u1");
    expect(hasQueueMigrated("u1")).toBe(true);
  });

  it("markQueueMigrated is scoped per user", () => {
    markQueueMigrated("u1");
    expect(hasQueueMigrated("u1")).toBe(true);
    expect(hasQueueMigrated("u2")).toBe(false);
  });

  it("markSessionMigrated is independent from markQueueMigrated", () => {
    markQueueMigrated("u1");
    expect(hasSessionMigrated("u1")).toBe(false);
    markSessionMigrated("u1");
    expect(hasSessionMigrated("u1")).toBe(true);
  });

  it("getLastUserId roundtrips via setLastUserId", () => {
    expect(getLastUserId()).toBeNull();
    setLastUserId("u1");
    expect(getLastUserId()).toBe("u1");
    setLastUserId("u2");
    expect(getLastUserId()).toBe("u2");
  });

  it("clearAllUserLocalData wipes queue, session, last-user-id, and every marker", () => {
    window.localStorage.setItem("contentgenie-player-queue", "[]");
    window.localStorage.setItem("contentgenie-player-session", "{}");
    setLastUserId("u1");
    markQueueMigrated("u1");
    markSessionMigrated("u1");
    markQueueMigrated("u2");
    // Keep an unrelated key — should NOT be wiped.
    window.localStorage.setItem("unrelated-key", "keep");

    clearAllUserLocalData();

    expect(window.localStorage.getItem("contentgenie-player-queue")).toBeNull();
    expect(
      window.localStorage.getItem("contentgenie-player-session"),
    ).toBeNull();
    expect(getLastUserId()).toBeNull();
    expect(hasQueueMigrated("u1")).toBe(false);
    expect(hasSessionMigrated("u1")).toBe(false);
    expect(hasQueueMigrated("u2")).toBe(false);
    expect(window.localStorage.getItem("unrelated-key")).toBe("keep");
  });
});
