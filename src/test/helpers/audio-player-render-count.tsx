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
//
// Vitest's default thread pool reuses workers across files, so prototype
// patches leak between test files unless restored. Pair every
// `stubHTMLMediaElement()` with `restoreHTMLMediaElement()` in afterEach so
// other tests in the same worker see the original (jsdom-default) prototype.
type PatchedKey = "play" | "pause" | "load" | "buffered";
let savedDescriptors: Partial<
  Record<PatchedKey, PropertyDescriptor | undefined>
> = {};

export function stubHTMLMediaElement(): void {
  const proto = HTMLMediaElement.prototype;
  savedDescriptors = {
    play: Object.getOwnPropertyDescriptor(proto, "play"),
    pause: Object.getOwnPropertyDescriptor(proto, "pause"),
    load: Object.getOwnPropertyDescriptor(proto, "load"),
    buffered: Object.getOwnPropertyDescriptor(proto, "buffered"),
  };
  proto.play = vi.fn().mockResolvedValue(undefined);
  proto.pause = vi.fn();
  proto.load = vi.fn();
  Object.defineProperty(proto, "buffered", {
    configurable: true,
    get() {
      return { length: 1, start: () => 0, end: () => 150 };
    },
  });
}

export function restoreHTMLMediaElement(): void {
  const proto = HTMLMediaElement.prototype;
  for (const key of ["play", "pause", "load", "buffered"] as PatchedKey[]) {
    const descriptor = savedDescriptors[key];
    if (descriptor) {
      Object.defineProperty(proto, key, descriptor);
    } else {
      delete (proto as unknown as Record<string, unknown>)[key];
    }
  }
  savedDescriptors = {};
}
