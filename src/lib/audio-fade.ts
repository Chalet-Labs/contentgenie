const FADE_STEP_MS = 50

/**
 * Gradually fades out audio volume and pauses playback on completion.
 *
 * @param audio - The HTMLAudioElement to fade out
 * @param durationMs - Duration of the fade in milliseconds
 * @param onComplete - Callback invoked after the fade finishes and audio is paused
 * @returns A cleanup function that cancels the fade and restores volume (idempotent)
 */
export function fadeOutAudio(
  audio: HTMLAudioElement,
  durationMs: number,
  onComplete: () => void
): () => void {
  const originalVolume = audio.volume
  const safeDurationMs =
    Number.isFinite(durationMs) && durationMs > 0 ? durationMs : FADE_STEP_MS
  const totalSteps = Math.max(1, Math.round(safeDurationMs / FADE_STEP_MS))
  const volumeStep = originalVolume / totalSteps

  let currentStep = 0
  let completed = false

  const intervalId = setInterval(() => {
    currentStep++

    if (currentStep >= totalSteps) {
      clearInterval(intervalId)
      completed = true
      audio.volume = 0
      audio.pause()
      audio.volume = originalVolume
      onComplete()
      return
    }

    audio.volume = Math.max(0, originalVolume - volumeStep * currentStep)
  }, FADE_STEP_MS)

  return () => {
    if (completed) return
    completed = true
    clearInterval(intervalId)
    audio.volume = originalVolume
  }
}
