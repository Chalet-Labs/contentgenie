import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setupMediaSessionHandlers,
  clearMediaSession,
} from "@/lib/media-session";

type SetActionHandlerSpy = ReturnType<typeof vi.fn>;

const noopHandlers = {
  onPlay: () => {},
  onPause: () => {},
  onSeekBackward: () => {},
  onSeekForward: () => {},
  onStop: () => {},
  onSeekTo: () => {},
};

function stubMediaSession(): SetActionHandlerSpy {
  const spy = vi.fn();
  Object.defineProperty(navigator, "mediaSession", {
    value: { setActionHandler: spy, metadata: null, setPositionState: vi.fn() },
    configurable: true,
    writable: true,
  });
  return spy;
}

function removeMediaSession() {
  // jsdom's navigator is a real object; deleting clears the stub so the SSR/early-return branch runs.
  Reflect.deleteProperty(navigator, "mediaSession");
}

describe("media-session", () => {
  let setActionHandler: SetActionHandlerSpy;

  beforeEach(() => {
    setActionHandler = stubMediaSession();
  });

  afterEach(() => {
    removeMediaSession();
  });

  describe("setupMediaSessionHandlers", () => {
    it("actively nulls nexttrack so Android compact slot surfaces seek buttons", () => {
      setupMediaSessionHandlers(noopHandlers);
      expect(setActionHandler).toHaveBeenCalledWith("nexttrack", null);
    });

    it("forwards finite, non-negative seekTime to onSeekTo", () => {
      const onSeekTo = vi.fn();
      setupMediaSessionHandlers({ ...noopHandlers, onSeekTo });
      const seektoCall = setActionHandler.mock.calls.find(
        ([action]) => action === "seekto",
      );
      expect(seektoCall).toBeDefined();
      const seektoHandler = seektoCall![1] as (details: {
        seekTime?: number;
      }) => void;

      seektoHandler({ seekTime: 0 });
      seektoHandler({ seekTime: 42.5 });
      expect(onSeekTo).toHaveBeenNthCalledWith(1, 0);
      expect(onSeekTo).toHaveBeenNthCalledWith(2, 42.5);
    });

    it("ignores non-finite or negative seekTime", () => {
      const onSeekTo = vi.fn();
      setupMediaSessionHandlers({ ...noopHandlers, onSeekTo });
      const seektoHandler = setActionHandler.mock.calls.find(
        ([action]) => action === "seekto",
      )![1] as (details: { seekTime?: number }) => void;

      seektoHandler({});
      seektoHandler({ seekTime: undefined });
      seektoHandler({ seekTime: Number.NaN });
      seektoHandler({ seekTime: Number.POSITIVE_INFINITY });
      seektoHandler({ seekTime: -1 });
      expect(onSeekTo).not.toHaveBeenCalled();
    });

    it("still registers baseline handlers when setActionHandler throws on seekto", () => {
      setActionHandler.mockImplementation((action: MediaSessionAction) => {
        if (action === "seekto") throw new TypeError("Unknown action");
      });

      expect(() => setupMediaSessionHandlers(noopHandlers)).not.toThrow();

      const registered = setActionHandler.mock.calls.map(([action]) => action);
      expect(registered).toEqual(
        expect.arrayContaining([
          "play",
          "pause",
          "seekbackward",
          "seekforward",
          "stop",
        ]),
      );
    });

    it("is a no-op when navigator.mediaSession is unavailable", () => {
      removeMediaSession();
      expect(() => setupMediaSessionHandlers(noopHandlers)).not.toThrow();
      expect(setActionHandler).not.toHaveBeenCalled();
    });
  });

  describe("clearMediaSession", () => {
    it("nulls every registered action handler including nexttrack and seekto", () => {
      clearMediaSession();
      const nulled = setActionHandler.mock.calls
        .filter(([, handler]) => handler === null)
        .map(([action]) => action);
      expect(nulled).toEqual(
        expect.arrayContaining([
          "play",
          "pause",
          "seekbackward",
          "seekforward",
          "stop",
          "nexttrack",
          "seekto",
        ]),
      );
    });

    it("is a no-op when navigator.mediaSession is unavailable", () => {
      removeMediaSession();
      expect(() => clearMediaSession()).not.toThrow();
      expect(setActionHandler).not.toHaveBeenCalled();
    });
  });
});
