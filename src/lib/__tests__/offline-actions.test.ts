import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock sync-queue before importing offline-actions
const mockEnqueue = vi.fn();

vi.mock("@/lib/sync-queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

// Mock server actions
const mockSaveEpisodeToLibrary = vi.fn();
const mockRemoveEpisodeFromLibrary = vi.fn();
const mockSubscribeToPodcast = vi.fn();
const mockUnsubscribeFromPodcast = vi.fn();

vi.mock("@/app/actions/library", () => ({
  saveEpisodeToLibrary: (...args: unknown[]) => mockSaveEpisodeToLibrary(...args),
  removeEpisodeFromLibrary: (...args: unknown[]) => mockRemoveEpisodeFromLibrary(...args),
}));

vi.mock("@/app/actions/subscriptions", () => ({
  subscribeToPodcast: (...args: unknown[]) => mockSubscribeToPodcast(...args),
  unsubscribeFromPodcast: (...args: unknown[]) => mockUnsubscribeFromPodcast(...args),
}));

const sampleEpisodeData = {
  podcastIndexId: "ep-123",
  title: "Test Episode",
  description: "A test",
  audioUrl: "https://example.com/audio.mp3",
  duration: 1800,
  podcast: {
    podcastIndexId: "pod-456",
    title: "Test Podcast",
    imageUrl: "https://example.com/art.jpg",
  },
};

const samplePodcastData = {
  podcastIndexId: "pod-456",
  title: "Test Podcast",
  description: "A podcast",
  imageUrl: "https://example.com/art.jpg",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEnqueue.mockResolvedValue("queue-id-1");

  // Default: no serviceWorker
  Object.defineProperty(navigator, "serviceWorker", {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("offlineSaveEpisode", () => {
  describe("online path", () => {
    it("calls saveEpisodeToLibrary directly when online", async () => {
      mockSaveEpisodeToLibrary.mockResolvedValue({ success: true, message: "Episode saved" });

      const { offlineSaveEpisode } = await import("@/lib/offline-actions");
      const result = await offlineSaveEpisode(sampleEpisodeData, true);

      expect(mockSaveEpisodeToLibrary).toHaveBeenCalledWith(sampleEpisodeData);
      expect(result.success).toBe(true);
      expect(result.queued).toBeFalsy();
    });

    it("returns server action result on online path", async () => {
      mockSaveEpisodeToLibrary.mockResolvedValue({ success: false, error: "DB error" });

      const { offlineSaveEpisode } = await import("@/lib/offline-actions");
      const result = await offlineSaveEpisode(sampleEpisodeData, true);

      expect(result.success).toBe(false);
      expect(result.error).toBe("DB error");
    });

    it("does not call enqueue when online", async () => {
      mockSaveEpisodeToLibrary.mockResolvedValue({ success: true });

      const { offlineSaveEpisode } = await import("@/lib/offline-actions");
      await offlineSaveEpisode(sampleEpisodeData, true);

      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });

  describe("offline path", () => {
    it("enqueues action with correct entityKey when offline", async () => {
      const { offlineSaveEpisode } = await import("@/lib/offline-actions");
      await offlineSaveEpisode(sampleEpisodeData, false);

      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "save-episode",
          entityKey: "episode:ep-123",
        })
      );
    });

    it("returns queued:true and success:true when offline", async () => {
      const { offlineSaveEpisode } = await import("@/lib/offline-actions");
      const result = await offlineSaveEpisode(sampleEpisodeData, false);

      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);
    });

    it("does not call saveEpisodeToLibrary when offline", async () => {
      const { offlineSaveEpisode } = await import("@/lib/offline-actions");
      await offlineSaveEpisode(sampleEpisodeData, false);

      expect(mockSaveEpisodeToLibrary).not.toHaveBeenCalled();
    });

    it("attempts Background Sync registration when serviceWorker and sync are available", async () => {
      const mockRegister = vi.fn().mockResolvedValue(undefined);
      const mockReady = Promise.resolve({
        sync: { register: mockRegister },
      });
      Object.defineProperty(navigator, "serviceWorker", {
        value: { ready: mockReady },
        configurable: true,
        writable: true,
      });

      const { offlineSaveEpisode } = await import("@/lib/offline-actions");
      await offlineSaveEpisode(sampleEpisodeData, false);

      // Give fire-and-forget (void tryRegisterSync()) a tick to run
      await new Promise((r) => setTimeout(r, 10));
      expect(mockRegister).toHaveBeenCalledWith("sync-offline-actions");
    });

    it("does not throw when serviceWorker is not available", async () => {
      const { offlineSaveEpisode } = await import("@/lib/offline-actions");
      await expect(offlineSaveEpisode(sampleEpisodeData, false)).resolves.not.toThrow();
    });
  });

  describe("dedup via entityKey", () => {
    it("passes correct entityKey for episode to enqueue", async () => {
      const { offlineSaveEpisode } = await import("@/lib/offline-actions");
      await offlineSaveEpisode(sampleEpisodeData, false);

      const call = mockEnqueue.mock.calls[0][0];
      expect(call.entityKey).toBe("episode:ep-123");
    });
  });
});

describe("offlineUnsaveEpisode", () => {
  it("calls removeEpisodeFromLibrary directly when online", async () => {
    mockRemoveEpisodeFromLibrary.mockResolvedValue({ success: true });

    const { offlineUnsaveEpisode } = await import("@/lib/offline-actions");
    const result = await offlineUnsaveEpisode("ep-123", true);

    expect(mockRemoveEpisodeFromLibrary).toHaveBeenCalledWith("ep-123");
    expect(result.success).toBe(true);
  });

  it("enqueues unsave-episode action when offline", async () => {
    const { offlineUnsaveEpisode } = await import("@/lib/offline-actions");
    await offlineUnsaveEpisode("ep-123", false);

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "unsave-episode",
        entityKey: "episode:ep-123",
      })
    );
  });

  it("returns queued:true when offline", async () => {
    const { offlineUnsaveEpisode } = await import("@/lib/offline-actions");
    const result = await offlineUnsaveEpisode("ep-123", false);

    expect(result.success).toBe(true);
    expect(result.queued).toBe(true);
  });

});

describe("offlineSubscribe", () => {
  it("calls subscribeToPodcast directly when online", async () => {
    mockSubscribeToPodcast.mockResolvedValue({ success: true, message: "Subscribed" });

    const { offlineSubscribe } = await import("@/lib/offline-actions");
    const result = await offlineSubscribe(samplePodcastData, true);

    expect(mockSubscribeToPodcast).toHaveBeenCalledWith(samplePodcastData);
    expect(result.success).toBe(true);
  });

  it("enqueues subscribe action when offline", async () => {
    const { offlineSubscribe } = await import("@/lib/offline-actions");
    await offlineSubscribe(samplePodcastData, false);

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "subscribe",
        entityKey: "podcast:pod-456",
      })
    );
  });

  it("returns queued:true when offline", async () => {
    const { offlineSubscribe } = await import("@/lib/offline-actions");
    const result = await offlineSubscribe(samplePodcastData, false);

    expect(result.success).toBe(true);
    expect(result.queued).toBe(true);
  });

  it("does not call subscribeToPodcast when offline", async () => {
    const { offlineSubscribe } = await import("@/lib/offline-actions");
    await offlineSubscribe(samplePodcastData, false);

    expect(mockSubscribeToPodcast).not.toHaveBeenCalled();
  });
});

describe("offlineUnsubscribe", () => {
  it("calls unsubscribeFromPodcast directly when online", async () => {
    mockUnsubscribeFromPodcast.mockResolvedValue({ success: true });

    const { offlineUnsubscribe } = await import("@/lib/offline-actions");
    const result = await offlineUnsubscribe("pod-456", true);

    expect(mockUnsubscribeFromPodcast).toHaveBeenCalledWith("pod-456");
    expect(result.success).toBe(true);
  });

  it("enqueues unsubscribe action when offline", async () => {
    const { offlineUnsubscribe } = await import("@/lib/offline-actions");
    await offlineUnsubscribe("pod-456", false);

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "unsubscribe",
        entityKey: "podcast:pod-456",
      })
    );
  });

  it("returns queued:true when offline", async () => {
    const { offlineUnsubscribe } = await import("@/lib/offline-actions");
    const result = await offlineUnsubscribe("pod-456", false);

    expect(result.success).toBe(true);
    expect(result.queued).toBe(true);
  });

  it("does not call unsubscribeFromPodcast when offline", async () => {
    const { offlineUnsubscribe } = await import("@/lib/offline-actions");
    await offlineUnsubscribe("pod-456", false);

    expect(mockUnsubscribeFromPodcast).not.toHaveBeenCalled();
  });
});
