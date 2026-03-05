import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fadeOutAudio } from "@/lib/audio-fade";

function createMockAudio(volume = 1): HTMLAudioElement {
  return {
    volume,
    pause: vi.fn(),
  } as unknown as HTMLAudioElement;
}

describe("fadeOutAudio", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gradually reduces volume and pauses on completion", () => {
    const audio = createMockAudio(1);
    const onComplete = vi.fn();

    fadeOutAudio(audio, 3000, onComplete);

    // After ~half the duration, volume should be reduced
    vi.advanceTimersByTime(1500);
    expect(audio.volume).toBeLessThan(1);
    expect(audio.volume).toBeGreaterThan(0);
    expect(audio.pause).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    // After full duration, should complete
    vi.advanceTimersByTime(1500);
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("restores original volume after fade completes", () => {
    const audio = createMockAudio(0.7);
    const onComplete = vi.fn();

    fadeOutAudio(audio, 3000, onComplete);

    vi.advanceTimersByTime(3000);

    expect(audio.volume).toBe(0.7);
    expect(audio.pause).toHaveBeenCalled();
  });

  it("cleanup cancels fade and restores volume", () => {
    const audio = createMockAudio(0.8);
    const onComplete = vi.fn();

    const cleanup = fadeOutAudio(audio, 3000, onComplete);

    // Advance partially
    vi.advanceTimersByTime(1000);
    expect(audio.volume).toBeLessThan(0.8);

    // Cancel
    cleanup();

    expect(audio.volume).toBe(0.8);
    expect(onComplete).not.toHaveBeenCalled();

    // Advancing further should not trigger anything
    vi.advanceTimersByTime(3000);
    expect(audio.pause).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("cleanup after completion is a no-op", () => {
    const audio = createMockAudio(1);
    const onComplete = vi.fn();

    const cleanup = fadeOutAudio(audio, 3000, onComplete);

    // Let it complete
    vi.advanceTimersByTime(3000);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(audio.volume).toBe(1);

    // Cleanup should be safe to call
    cleanup();
    expect(audio.volume).toBe(1);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("handles zero initial volume", () => {
    const audio = createMockAudio(0);
    const onComplete = vi.fn();

    fadeOutAudio(audio, 3000, onComplete);

    vi.advanceTimersByTime(3000);

    expect(audio.pause).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(audio.volume).toBe(0);
  });

  it("works with custom fade duration", () => {
    const audio = createMockAudio(1);
    const onComplete = vi.fn();

    fadeOutAudio(audio, 500, onComplete);

    vi.advanceTimersByTime(250);
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(audio.pause).toHaveBeenCalledOnce();
  });

  it("volume never goes below zero", () => {
    const audio = createMockAudio(0.5);
    const onComplete = vi.fn();
    const originalVolumeSetter = Object.getOwnPropertyDescriptor(audio, "volume")?.set;

    let minVolume = 0.5;
    const volumeValues: number[] = [];

    // Track all volume changes
    let currentVolume = 0.5;
    Object.defineProperty(audio, "volume", {
      get: () => currentVolume,
      set: (v: number) => {
        currentVolume = v;
        volumeValues.push(v);
        if (v < minVolume) minVolume = v;
      },
    });

    fadeOutAudio(audio, 3000, onComplete);
    vi.advanceTimersByTime(3000);

    // Verify no volume was negative
    expect(volumeValues.every((v) => v >= 0)).toBe(true);
  });
});
