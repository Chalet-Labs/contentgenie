import { enqueue, SYNC_TAG } from "@/lib/sync-queue";
import { saveEpisodeToLibrary, removeEpisodeFromLibrary } from "@/app/actions/library";
import { subscribeToPodcast, unsubscribeFromPodcast } from "@/app/actions/subscriptions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  queued?: boolean;
  error?: string;
  message?: string;
}

interface EpisodeData {
  podcastIndexId: string;
  title: string;
  description?: string;
  audioUrl?: string;
  duration?: number;
  publishDate?: Date;
  podcast: {
    podcastIndexId: string;
    title: string;
    description?: string;
    publisher?: string;
    imageUrl?: string;
    rssFeedUrl?: string;
    categories?: string[];
    totalEpisodes?: number;
  };
}

interface SubscribePodcastData {
  podcastIndexId: string;
  title: string;
  description?: string;
  publisher?: string;
  imageUrl?: string;
  rssFeedUrl?: string;
  categories?: string[];
  totalEpisodes?: number;
  latestEpisodeDate?: Date;
}

// ─── Background Sync registration helper ──────────────────────────────────────

async function tryRegisterSync(): Promise<void> {
  try {
    if (navigator?.serviceWorker) {
      const reg = await navigator.serviceWorker.ready;
      if ("sync" in reg) {
        await (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register(SYNC_TAG);
      }
    }
  } catch {
    // Background Sync not available — fallback handled by useSyncQueue
  }
}

// ─── Action wrappers ──────────────────────────────────────────────────────────

export async function offlineSaveEpisode(
  episodeData: EpisodeData,
  isOnline: boolean,
): Promise<ActionResult> {
  // Online path: call server action directly
  if (isOnline) {
    const result = await saveEpisodeToLibrary(episodeData);
    return result;
  }

  // Offline path: enqueue for later sync
  const entityKey = `episode:${episodeData.podcastIndexId}`;

  await enqueue({
    action: "save-episode",
    entityKey,
    payload: episodeData as unknown as Record<string, unknown>,
  });

  // Fire-and-forget sync registration
  void tryRegisterSync();

  return { success: true, queued: true, message: "Saved (will sync when online)" };
}

export async function offlineUnsaveEpisode(
  podcastIndexId: string,
  isOnline: boolean,
): Promise<ActionResult> {
  // Online path
  if (isOnline) {
    const result = await removeEpisodeFromLibrary(podcastIndexId);
    return result;
  }

  // Offline path
  const entityKey = `episode:${podcastIndexId}`;

  await enqueue({
    action: "unsave-episode",
    entityKey,
    payload: { podcastIndexId },
  });

  void tryRegisterSync();

  return { success: true, queued: true, message: "Removed (will sync when online)" };
}

export async function offlineSubscribe(
  podcastData: SubscribePodcastData,
  isOnline: boolean,
): Promise<ActionResult> {
  // Online path
  if (isOnline) {
    const result = await subscribeToPodcast(podcastData);
    return result;
  }

  // Offline path
  const entityKey = `podcast:${podcastData.podcastIndexId}`;

  await enqueue({
    action: "subscribe",
    entityKey,
    payload: podcastData as unknown as Record<string, unknown>,
  });

  void tryRegisterSync();

  return { success: true, queued: true, message: "Subscribed (will sync when online)" };
}

export async function offlineUnsubscribe(
  podcastIndexId: string,
  isOnline: boolean,
): Promise<ActionResult> {
  // Online path
  if (isOnline) {
    const result = await unsubscribeFromPodcast(podcastIndexId);
    return result;
  }

  // Offline path
  const entityKey = `podcast:${podcastIndexId}`;

  await enqueue({
    action: "unsubscribe",
    entityKey,
    payload: { podcastIndexId },
  });

  void tryRegisterSync();

  return { success: true, queued: true, message: "Unsubscribed (will sync when online)" };
}
