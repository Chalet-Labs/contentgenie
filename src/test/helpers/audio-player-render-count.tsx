import { type ProfilerOnRenderCallback } from "react";
import { vi } from "vitest";
import {
  useAudioPlayerAPI,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context";

export interface RenderCountHarness {
  onRender: ProfilerOnRenderCallback;
  APIBridge: () => null;
  readonly renders: number;
  readonly api: AudioPlayerAPI | null;
  reset(): void;
}

export function createRenderCountHarness(): RenderCountHarness {
  let renders = 0;
  let capturedAPI: AudioPlayerAPI | null = null;

  return {
    onRender: () => {
      renders += 1;
    },
    APIBridge: () => {
      capturedAPI = useAudioPlayerAPI();
      return null;
    },
    get renders() {
      return renders;
    },
    get api() {
      return capturedAPI;
    },
    reset() {
      renders = 0;
      capturedAPI = null;
    },
  };
}

// jsdom doesn't implement HTMLMediaElement natively. Audio-player tests
// dispatch real audio events through the provider, so the prototype needs
// stubs for play/pause/load and a `buffered` getter.
export function stubHTMLMediaElement(): void {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, "buffered", {
    configurable: true,
    get() {
      return { length: 1, start: () => 0, end: () => 150 };
    },
  });
}
