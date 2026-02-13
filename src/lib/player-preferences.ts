const STORAGE_KEY = "contentgenie-player-preferences"

export const SPEED_OPTIONS = [1, 1.25, 1.5, 2] as const
export type SpeedOption = (typeof SPEED_OPTIONS)[number]

export interface PlayerPreferences {
  volume: number
  playbackSpeed: number
}

const DEFAULT_PREFERENCES: PlayerPreferences = {
  volume: 1,
  playbackSpeed: 1,
}

export function loadPlayerPreferences(): PlayerPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES

    const parsed = JSON.parse(raw) as Partial<PlayerPreferences>
    return {
      volume:
        typeof parsed.volume === "number" && parsed.volume >= 0 && parsed.volume <= 1
          ? parsed.volume
          : DEFAULT_PREFERENCES.volume,
      playbackSpeed:
        typeof parsed.playbackSpeed === "number" &&
        (SPEED_OPTIONS as readonly number[]).includes(parsed.playbackSpeed)
          ? (parsed.playbackSpeed as SpeedOption)
          : DEFAULT_PREFERENCES.playbackSpeed,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function savePlayerPreferences(prefs: Partial<PlayerPreferences>): void {
  if (typeof window === "undefined") return

  try {
    const current = loadPlayerPreferences()
    const merged = { ...current, ...prefs }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // localStorage may be unavailable (e.g. private browsing quota exceeded)
  }
}
