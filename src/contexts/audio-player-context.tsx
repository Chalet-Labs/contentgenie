"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import {
  updateMediaSessionMetadata,
  setupMediaSessionHandlers,
  updateMediaSessionPosition,
  clearMediaSession,
} from "@/lib/media-session"
import {
  loadPlayerPreferences,
  savePlayerPreferences,
} from "@/lib/player-preferences"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioEpisode {
  id: string
  title: string
  podcastTitle: string
  audioUrl: string
  artwork?: string
  duration?: number
}

export interface AudioPlayerState {
  currentEpisode: AudioEpisode | null
  isPlaying: boolean
  isBuffering: boolean
  isVisible: boolean
  duration: number
  volume: number
  playbackSpeed: number
  hasError: boolean
  errorMessage: string | null
}

export interface AudioPlayerProgress {
  currentTime: number
  buffered: number
}

export interface AudioPlayerAPI {
  playEpisode: (episode: AudioEpisode) => void
  togglePlay: () => void
  seek: (time: number) => void
  skipForward: (seconds?: number) => void
  skipBack: (seconds?: number) => void
  setVolume: (volume: number) => void
  setPlaybackSpeed: (speed: number) => void
  closePlayer: () => void
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type Action =
  | { type: "PLAY_EPISODE"; episode: AudioEpisode }
  | { type: "SET_PLAYING"; isPlaying: boolean }
  | { type: "SET_BUFFERING"; isBuffering: boolean }
  | { type: "SET_DURATION"; duration: number }
  | { type: "SET_VOLUME"; volume: number }
  | { type: "SET_PLAYBACK_SPEED"; speed: number }
  | { type: "SET_ERROR"; message: string }
  | { type: "CLEAR_ERROR" }
  | { type: "CLOSE" }

function reducer(state: AudioPlayerState, action: Action): AudioPlayerState {
  switch (action.type) {
    case "PLAY_EPISODE":
      return {
        ...state,
        currentEpisode: action.episode,
        isPlaying: true,
        isBuffering: true,
        isVisible: true,
        hasError: false,
        errorMessage: null,
        duration: action.episode.duration ?? 0,
      }
    case "SET_PLAYING":
      return { ...state, isPlaying: action.isPlaying }
    case "SET_BUFFERING":
      return { ...state, isBuffering: action.isBuffering }
    case "SET_DURATION":
      return { ...state, duration: action.duration }
    case "SET_VOLUME":
      return { ...state, volume: action.volume }
    case "SET_PLAYBACK_SPEED":
      return { ...state, playbackSpeed: action.speed }
    case "SET_ERROR":
      return {
        ...state,
        hasError: true,
        errorMessage: action.message,
        isPlaying: false,
        isBuffering: false,
      }
    case "CLEAR_ERROR":
      return { ...state, hasError: false, errorMessage: null }
    case "CLOSE":
      return {
        ...state,
        currentEpisode: null,
        isPlaying: false,
        isBuffering: false,
        isVisible: false,
        hasError: false,
        errorMessage: null,
        duration: 0,
      }
    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

// MediaError.code constants (numeric values per spec, avoids runtime reference issues)
const MEDIA_ERR_ABORTED = 1
const MEDIA_ERR_NETWORK = 2
const MEDIA_ERR_DECODE = 3
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

function getMediaErrorMessage(code: number): string {
  switch (code) {
    case MEDIA_ERR_ABORTED:
      return "Playback was aborted."
    case MEDIA_ERR_NETWORK:
      return "A network error occurred while loading audio."
    case MEDIA_ERR_DECODE:
      return "The audio file could not be decoded."
    case MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "This audio format is not supported."
    default:
      return "An unknown playback error occurred."
  }
}

// ---------------------------------------------------------------------------
// Contexts
// ---------------------------------------------------------------------------

export const AudioPlayerAPIContext = createContext<AudioPlayerAPI | null>(null)
export const AudioPlayerStateContext = createContext<AudioPlayerState | null>(null)
export const AudioPlayerProgressContext = createContext<AudioPlayerProgress | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const SKIP_SECONDS = 15
const STALL_TIMEOUT_MS = 10_000

const initialState: AudioPlayerState = {
  currentEpisode: null,
  isPlaying: false,
  isBuffering: false,
  isVisible: false,
  duration: 0,
  volume: 1,
  playbackSpeed: 1,
  hasError: false,
  errorMessage: null,
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ariaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [state, dispatch] = useReducer(reducer, initialState)

  const progressRef = useRef<AudioPlayerProgress>({ currentTime: 0, buffered: 0 })
  const [progress, setProgress] = useReducer(
    (_prev: AudioPlayerProgress, next: AudioPlayerProgress) => next,
    { currentTime: 0, buffered: 0 }
  )

  // Announce time for screen readers (debounced 15s)
  const [ariaAnnouncement, setAriaAnnouncement] = useReducer(
    (_prev: string, next: string) => next,
    ""
  )

  // ---- Load preferences on mount ----
  useEffect(() => {
    const prefs = loadPlayerPreferences()
    dispatch({ type: "SET_VOLUME", volume: prefs.volume })
    dispatch({ type: "SET_PLAYBACK_SPEED", speed: prefs.playbackSpeed })
  }, [])

  // ---- Sync volume & speed to audio element ----
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = state.volume
  }, [state.volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.playbackRate = state.playbackSpeed
  }, [state.playbackSpeed])

  // ---- Stall timeout ----
  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current)
      stallTimerRef.current = null
    }
  }, [])

  const startStallTimer = useCallback(() => {
    clearStallTimer()
    stallTimerRef.current = setTimeout(() => {
      toast.error("Audio stalled", {
        description: "The audio stream appears to have stalled. Try seeking or reloading.",
      })
    }, STALL_TIMEOUT_MS)
  }, [clearStallTimer])

  // ---- API (stable reference) ----
  const api = useMemo<AudioPlayerAPI>(
    () => ({
      playEpisode: (episode: AudioEpisode) => {
        const audio = audioRef.current
        if (!audio) return
        dispatch({ type: "PLAY_EPISODE", episode })
        audio.src = episode.audioUrl
        audio.load()
        audio.play().catch(() => {
          // Autoplay blocked — user will see "play" button
          dispatch({ type: "SET_PLAYING", isPlaying: false })
        })
        updateMediaSessionMetadata({
          title: episode.title,
          artist: episode.podcastTitle,
          artwork: episode.artwork,
        })
      },

      togglePlay: () => {
        const audio = audioRef.current
        if (!audio || !audio.src) return
        if (audio.paused) {
          audio.play().catch(() => {
            dispatch({ type: "SET_PLAYING", isPlaying: false })
          })
        } else {
          audio.pause()
        }
      },

      seek: (time: number) => {
        const audio = audioRef.current
        if (!audio) return
        audio.currentTime = Math.max(0, Math.min(time, audio.duration || 0))
      },

      skipForward: (seconds = SKIP_SECONDS) => {
        const audio = audioRef.current
        if (!audio) return
        audio.currentTime = Math.min(
          audio.currentTime + seconds,
          audio.duration || 0
        )
      },

      skipBack: (seconds = SKIP_SECONDS) => {
        const audio = audioRef.current
        if (!audio) return
        audio.currentTime = Math.max(audio.currentTime - seconds, 0)
      },

      setVolume: (volume: number) => {
        const clamped = Math.max(0, Math.min(1, volume))
        dispatch({ type: "SET_VOLUME", volume: clamped })
        savePlayerPreferences({ volume: clamped })
      },

      setPlaybackSpeed: (speed: number) => {
        dispatch({ type: "SET_PLAYBACK_SPEED", speed })
        savePlayerPreferences({ playbackSpeed: speed })
      },

      closePlayer: () => {
        const audio = audioRef.current
        if (audio) {
          audio.pause()
          audio.removeAttribute("src")
          audio.load()
        }
        dispatch({ type: "CLOSE" })
        setProgress({ currentTime: 0, buffered: 0 })
        clearMediaSession()
        clearStallTimer()
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable: actions close over refs
    []
  )

  // ---- Media Session handlers ----
  useEffect(() => {
    setupMediaSessionHandlers({
      onPlay: api.togglePlay,
      onPause: api.togglePlay,
      onSeekBackward: () => api.skipBack(),
      onSeekForward: () => api.skipForward(),
      onStop: api.closePlayer,
    })
    return () => clearMediaSession()
  }, [api])

  // ---- Audio event listeners ----
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      const next: AudioPlayerProgress = {
        currentTime: audio.currentTime,
        buffered:
          audio.buffered.length > 0
            ? audio.buffered.end(audio.buffered.length - 1)
            : 0,
      }
      progressRef.current = next
      setProgress(next)

      updateMediaSessionPosition(
        audio.currentTime,
        audio.duration || 0,
        audio.playbackRate
      )

      // Debounced ARIA announcement (every 15s)
      if (!ariaTimerRef.current) {
        ariaTimerRef.current = setTimeout(() => {
          const mins = Math.floor(audio.currentTime / 60)
          const secs = Math.floor(audio.currentTime % 60)
          setAriaAnnouncement(`${mins} minutes ${secs} seconds`)
          ariaTimerRef.current = null
        }, 15_000)
      }
    }

    const onProgress = () => {
      const next: AudioPlayerProgress = {
        currentTime: progressRef.current.currentTime,
        buffered:
          audio.buffered.length > 0
            ? audio.buffered.end(audio.buffered.length - 1)
            : 0,
      }
      progressRef.current = next
      setProgress(next)
    }

    const onDurationChange = () => {
      dispatch({ type: "SET_DURATION", duration: audio.duration || 0 })
    }

    const onPlaying = () => {
      dispatch({ type: "SET_PLAYING", isPlaying: true })
      dispatch({ type: "SET_BUFFERING", isBuffering: false })
      dispatch({ type: "CLEAR_ERROR" })
      clearStallTimer()
    }

    const onPause = () => {
      dispatch({ type: "SET_PLAYING", isPlaying: false })
      clearStallTimer()
    }

    const onWaiting = () => {
      dispatch({ type: "SET_BUFFERING", isBuffering: true })
      startStallTimer()
    }

    const onStalled = () => {
      dispatch({ type: "SET_BUFFERING", isBuffering: true })
      startStallTimer()
    }

    const onEnded = () => {
      dispatch({ type: "SET_PLAYING", isPlaying: false })
      clearStallTimer()
    }

    const onError = () => {
      const errorCode = audio.error?.code ?? 0
      const message = getMediaErrorMessage(errorCode)
      dispatch({ type: "SET_ERROR", message })
      toast.error("Playback error", { description: message })
      clearStallTimer()
    }

    audio.addEventListener("timeupdate", onTimeUpdate)
    audio.addEventListener("progress", onProgress)
    audio.addEventListener("durationchange", onDurationChange)
    audio.addEventListener("playing", onPlaying)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("waiting", onWaiting)
    audio.addEventListener("stalled", onStalled)
    audio.addEventListener("ended", onEnded)
    audio.addEventListener("error", onError)

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate)
      audio.removeEventListener("progress", onProgress)
      audio.removeEventListener("durationchange", onDurationChange)
      audio.removeEventListener("playing", onPlaying)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("waiting", onWaiting)
      audio.removeEventListener("stalled", onStalled)
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("error", onError)
      clearStallTimer()
      if (ariaTimerRef.current) {
        clearTimeout(ariaTimerRef.current)
      }
    }
  }, [clearStallTimer, startStallTimer])

  return (
    <AudioPlayerAPIContext.Provider value={api}>
      <AudioPlayerStateContext.Provider value={state}>
        <AudioPlayerProgressContext.Provider value={progress}>
          {children}
          {/* Hidden audio element */}
          <audio ref={audioRef} preload="metadata" />
          {/* Screen reader time announcements */}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {ariaAnnouncement}
          </div>
        </AudioPlayerProgressContext.Provider>
      </AudioPlayerStateContext.Provider>
    </AudioPlayerAPIContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useAudioPlayerAPI(): AudioPlayerAPI {
  const ctx = useContext(AudioPlayerAPIContext)
  if (!ctx) {
    throw new Error("useAudioPlayerAPI must be used within AudioPlayerProvider")
  }
  return ctx
}

export function useAudioPlayerState(): AudioPlayerState {
  const ctx = useContext(AudioPlayerStateContext)
  if (!ctx) {
    throw new Error("useAudioPlayerState must be used within AudioPlayerProvider")
  }
  return ctx
}

export function useAudioPlayerProgress(): AudioPlayerProgress {
  const ctx = useContext(AudioPlayerProgressContext)
  if (!ctx) {
    throw new Error(
      "useAudioPlayerProgress must be used within AudioPlayerProvider"
    )
  }
  return ctx
}

/** Convenience hook combining state + API (not progress — to avoid high-frequency re-renders). */
export function useAudioPlayer() {
  return {
    ...useAudioPlayerState(),
    ...useAudioPlayerAPI(),
  }
}
