import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPlayerSession,
  savePlayerSession,
  clearPlayerSession,
} from "@/lib/player-session";
import type { AudioEpisode } from "@/contexts/audio-player-context";
import {
  installLocalStorageMock,
  installQuotaExceededLocalStorage,
  withoutWindow,
} from "@/test/mocks/local-storage";
import { validEpisode } from "@/test/fixtures/audio-episode";
import { asPodcastIndexEpisodeId } from "@/types/ids";

const STORAGE_KEY = "contentgenie-player-session";

function storeSession(
  episode: AudioEpisode,
  currentTime: number,
  savedAt?: number,
) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      episode,
      currentTime,
      savedAt: savedAt ?? Date.now(),
    }),
  );
}

describe("loadPlayerSession", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it("returns null when nothing stored", () => {
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns valid session data", () => {
    storeSession(validEpisode, 120);
    const result = loadPlayerSession();
    expect(result).not.toBeNull();
    expect(result!.episode.id).toBe("ep-1");
    expect(result!.currentTime).toBe(120);
  });

  it("does not include savedAt in returned data", () => {
    storeSession(validEpisode, 120);
    const result = loadPlayerSession();
    expect(result).not.toBeNull();
    expect(result).toEqual({
      episode: validEpisode,
      currentTime: 120,
    });
    expect(Object.hasOwn(result!, "savedAt")).toBe(false);
  });

  it("returns null for corrupted JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "not valid json{{{");
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null for non-object JSON (array)", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null for non-object JSON (string)", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify("hello"));
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null for non-object JSON (number)", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(42));
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when episode missing required field id", () => {
    const bad = { ...validEpisode, id: undefined };
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ episode: bad, currentTime: 10, savedAt: Date.now() }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when episode missing required field title", () => {
    const bad = { ...validEpisode, title: "" };
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ episode: bad, currentTime: 10, savedAt: Date.now() }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when episode missing required field podcastTitle", () => {
    const { podcastTitle: _, ...bad } = validEpisode;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ episode: bad, currentTime: 10, savedAt: Date.now() }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when episode missing required field audioUrl", () => {
    const { audioUrl: _, ...bad } = validEpisode;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ episode: bad, currentTime: 10, savedAt: Date.now() }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when currentTime is negative", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        episode: validEpisode,
        currentTime: -5,
        savedAt: Date.now(),
      }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when currentTime is null (NaN serializes to null via JSON)", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        episode: validEpisode,
        currentTime: NaN,
        savedAt: Date.now(),
      }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when currentTime is a string", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        episode: validEpisode,
        currentTime: "120",
        savedAt: Date.now(),
      }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when currentTime is missing", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        episode: validEpisode,
        savedAt: Date.now(),
      }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns valid session regardless of how old savedAt is (no TTL)", () => {
    const oldAt = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    storeSession(validEpisode, 120, oldAt);
    const result = loadPlayerSession();
    expect(result).not.toBeNull();
    expect(result!.currentTime).toBe(120);
  });

  it("returns valid session when savedAt is recent", () => {
    const recentAt = Date.now() - 23 * 60 * 60 * 1000; // 23 hours ago
    storeSession(validEpisode, 120, recentAt);
    const result = loadPlayerSession();
    expect(result).not.toBeNull();
    expect(result!.currentTime).toBe(120);
  });

  it("returns null in SSR environment", () => {
    withoutWindow(() => {
      expect(loadPlayerSession()).toBeNull();
    });
  });

  it("returns null when artwork is invalid (non-string)", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        episode: { ...validEpisode, artwork: 123 },
        currentTime: 10,
        savedAt: Date.now(),
      }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when artwork is empty string", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        episode: { ...validEpisode, artwork: "" },
        currentTime: 10,
        savedAt: Date.now(),
      }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when duration is negative", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        episode: { ...validEpisode, duration: -1 },
        currentTime: 10,
        savedAt: Date.now(),
      }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when duration is null (NaN serializes to null via JSON)", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        episode: { ...validEpisode, duration: NaN },
        currentTime: 10,
        savedAt: Date.now(),
      }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when chaptersUrl is non-string", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        episode: { ...validEpisode, chaptersUrl: 42 },
        currentTime: 10,
        savedAt: Date.now(),
      }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("returns null when chaptersUrl is empty string", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        episode: { ...validEpisode, chaptersUrl: "" },
        currentTime: 10,
        savedAt: Date.now(),
      }),
    );
    expect(loadPlayerSession()).toBeNull();
  });

  it("accepts episode without optional fields", () => {
    const minimalEpisode: AudioEpisode = {
      id: asPodcastIndexEpisodeId("ep-min"),
      title: "Minimal",
      podcastTitle: "Pod",
      audioUrl: "https://example.com/a.mp3",
    };
    storeSession(minimalEpisode, 0);
    const result = loadPlayerSession();
    expect(result).not.toBeNull();
    expect(result!.episode.id).toBe("ep-min");
  });
});

describe("savePlayerSession", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it("saves session to localStorage with correct key", () => {
    savePlayerSession(validEpisode, 300);
    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.episode.id).toBe("ep-1");
    expect(parsed.currentTime).toBe(300);
  });

  it("includes savedAt timestamp in stored data", () => {
    const before = Date.now();
    savePlayerSession(validEpisode, 300);
    const after = Date.now();
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(parsed.savedAt).toBeGreaterThanOrEqual(before);
    expect(parsed.savedAt).toBeLessThanOrEqual(after);
  });

  it("handles quota exceeded error gracefully", () => {
    installQuotaExceededLocalStorage();
    expect(() => savePlayerSession(validEpisode, 300)).not.toThrow();
  });

  it("does nothing in SSR environment", () => {
    withoutWindow(() => {
      expect(() => savePlayerSession(validEpisode, 300)).not.toThrow();
    });
  });
});

describe("clearPlayerSession", () => {
  beforeEach(() => {
    installLocalStorageMock();
  });

  it("removes session from localStorage", () => {
    savePlayerSession(validEpisode, 300);
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    clearPlayerSession();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("does not throw when key does not exist", () => {
    expect(() => clearPlayerSession()).not.toThrow();
  });

  it("does nothing in SSR environment", () => {
    withoutWindow(() => {
      expect(() => clearPlayerSession()).not.toThrow();
    });
  });
});
