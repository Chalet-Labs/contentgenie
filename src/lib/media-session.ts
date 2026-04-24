export interface MediaSessionTrack {
  title: string;
  artist: string;
  artwork?: string;
}

function setActionHandlerSafe(
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
): void {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // Action may not be supported on all platforms.
  }
}

export function updateMediaSessionMetadata(track: MediaSessionTrack): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator))
    return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    artwork: track.artwork
      ? [
          { src: track.artwork, sizes: "96x96", type: "image/png" },
          { src: track.artwork, sizes: "128x128", type: "image/png" },
          { src: track.artwork, sizes: "192x192", type: "image/png" },
          { src: track.artwork, sizes: "256x256", type: "image/png" },
          { src: track.artwork, sizes: "384x384", type: "image/png" },
          { src: track.artwork, sizes: "512x512", type: "image/png" },
        ]
      : [],
  });
}

export function setupMediaSessionHandlers(handlers: {
  onPlay: () => void;
  onPause: () => void;
  onSeekBackward: () => void;
  onSeekForward: () => void;
  onStop: () => void;
  onSeekTo: (time: number) => void;
}): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator))
    return;

  navigator.mediaSession.setActionHandler("play", handlers.onPlay);
  navigator.mediaSession.setActionHandler("pause", handlers.onPause);
  navigator.mediaSession.setActionHandler(
    "seekbackward",
    handlers.onSeekBackward,
  );
  navigator.mediaSession.setActionHandler(
    "seekforward",
    handlers.onSeekForward,
  );
  navigator.mediaSession.setActionHandler("stop", handlers.onStop);
  // Never register "nexttrack": Chrome on Android's compact notification slot ranks it
  // above seekforward, displacing rewind/forward. Null overwrites any stale handler (#355).
  setActionHandlerSafe("nexttrack", null);
  setActionHandlerSafe("seekto", (details) => {
    const seekTime = details.seekTime;
    if (
      typeof seekTime === "number" &&
      Number.isFinite(seekTime) &&
      seekTime >= 0
    ) {
      handlers.onSeekTo(seekTime);
    }
  });
}

export function updateMediaSessionPosition(
  position: number,
  duration: number,
  playbackRate: number,
): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator))
    return;

  try {
    navigator.mediaSession.setPositionState({
      duration: Math.max(0, duration),
      playbackRate,
      position: Math.max(0, Math.min(position, duration)),
    });
  } catch {
    // setPositionState can throw if values are invalid
  }
}

export function clearMediaSession(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator))
    return;

  navigator.mediaSession.metadata = null;
  navigator.mediaSession.setActionHandler("play", null);
  navigator.mediaSession.setActionHandler("pause", null);
  navigator.mediaSession.setActionHandler("seekbackward", null);
  navigator.mediaSession.setActionHandler("seekforward", null);
  navigator.mediaSession.setActionHandler("stop", null);
  setActionHandlerSafe("nexttrack", null);
  setActionHandlerSafe("seekto", null);
}
