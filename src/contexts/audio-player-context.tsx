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
import { arrayMove } from "@dnd-kit/sortable"
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
import { loadQueue, saveQueue } from "@/lib/queue-persistence"
import {
  loadPlayerSession,
  savePlayerSession,
  clearPlayerSession,
} from "@/lib/player-session"
import { fadeOutAudio } from "@/lib/audio-fade"
import type { Chapter } from "@/lib/chapters"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SleepTimerType = "duration" | "end-of-episode"

export interface SleepTimerState {
  /** Absolute time (Date.now() ms) when the timer expires. Null for end-of-episode. */
  endTime: number | null
  type: SleepTimerType
}

export interface AudioEpisode {
  id: string
  title: string
  podcastTitle: string
  audioUrl: string
  artwork?: string
  duration?: number
  chaptersUrl?: string
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
  queue: AudioEpisode[]
  chapters: Chapter[] | null
  chaptersLoading: boolean
  sleepTimer: SleepTimerState | null
}

export interface AudioPlayerProgress {
  currentTime: number
  buffered: number
}

export interface AudioPlayerAPI {
  playEpisode: (episode: AudioEpisode, options?: { startAt?: number }) => void
  togglePlay: () => void
  seek: (time: number) => void
  skipForward: (seconds?: number) => void
  skipBack: (seconds?: number) => void
  setVolume: (volume: number) => void
  setPlaybackSpeed: (speed: number) => void
  closePlayer: () => void
  addToQueue: (episode: AudioEpisode) => void
  removeFromQueue: (episodeId: string) => void
  reorderQueue: (oldIndex: number, newIndex: number) => void
  clearQueue: () => void
  playNext: () => void
  setSleepTimer: (option: number | "end-of-episode") => void
  cancelSleepTimer: () => void
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
  | { type: "ADD_TO_QUEUE"; episode: AudioEpisode }
  | { type: "REMOVE_FROM_QUEUE"; episodeId: string }
  | { type: "REORDER_QUEUE"; oldIndex: number; newIndex: number }
  | { type: "CLEAR_QUEUE" }
  | { type: "INIT_QUEUE"; queue: AudioEpisode[] }
  | { type: "SET_CHAPTERS"; chapters: Chapter[] }
  | { type: "CLEAR_CHAPTERS" }
  | { type: "SET_SLEEP_TIMER"; sleepTimer: SleepTimerState }
  | { type: "CLEAR_SLEEP_TIMER" }

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
        chapters: null,
        chaptersLoading: !!action.episode.chaptersUrl,
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
        chapters: null,
        chaptersLoading: false,
        sleepTimer: null,
      }
    case "ADD_TO_QUEUE": {
      const alreadyQueued = state.queue.some(
        (ep) => ep.id === action.episode.id
      )
      if (alreadyQueued) return state
      return { ...state, queue: [...state.queue, action.episode] }
    }
    case "REMOVE_FROM_QUEUE":
      return {
        ...state,
        queue: state.queue.filter((ep) => ep.id !== action.episodeId),
      }
    case "REORDER_QUEUE": {
      if (
        action.oldIndex < 0 ||
        action.oldIndex >= state.queue.length ||
        action.newIndex < 0 ||
        action.newIndex >= state.queue.length
      ) {
        return state
      }
      return {
        ...state,
        queue: arrayMove(state.queue, action.oldIndex, action.newIndex),
      }
    }
    case "CLEAR_QUEUE":
      return { ...state, queue: [] }
    case "INIT_QUEUE":
      return { ...state, queue: action.queue }
    case "SET_CHAPTERS":
      return { ...state, chapters: action.chapters, chaptersLoading: false }
    case "CLEAR_CHAPTERS":
      return { ...state, chapters: null, chaptersLoading: false }
    case "SET_SLEEP_TIMER":
      return { ...state, sleepTimer: action.sleepTimer }
    case "CLEAR_SLEEP_TIMER":
      return { ...state, sleepTimer: null }
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
const SLEEP_FADE_DURATION_MS = 3000
const MS_PER_MINUTE = 60_000
const SLEEP_TIMER_TOAST = "Sleep timer — playback paused"

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
  queue: [],
  chapters: null,
  chaptersLoading: false,
  sleepTimer: null,
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ariaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isAutoAdvancing = useRef(false)
  const isQueueHydrated = useRef(false)
  const chaptersFetchController = useRef<AbortController | null>(null)
  const chaptersTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sleepTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fadeCleanupRef = useRef<(() => void) | null>(null)
  const pendingSeekRef = useRef<number | null>(null)
  const sessionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSessionRestored = useRef(false)

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

  // ---- Hydrate queue from localStorage on mount ----
  useEffect(() => {
    const persisted = loadQueue()
    dispatch({ type: "INIT_QUEUE", queue: persisted })
    isQueueHydrated.current = true
  }, [])

  // ---- Restore session from localStorage on mount ----
  useEffect(() => {
    const session = loadPlayerSession()
    if (session) {
      loadEpisodeIntoPlayer(session.episode, {
        andPlay: false,
        startAt: session.currentTime,
      })
    }
    isSessionRestored.current = true
  }, [])

  // ---- Persist queue to localStorage on changes ----
  useEffect(() => {
    if (!isQueueHydrated.current) return
    saveQueue(state.queue)
  }, [state.queue])

  // ---- Sync volume & speed to audio element ----
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    // Skip direct volume writes while a sleep fade is ramping down
    if (fadeCleanupRef.current) return
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

  // ---- Ref to always have latest state in callbacks ----
  const stateRef = useRef(state)
  stateRef.current = state

  // ---- Clear auto-play timer helper ----
  const clearAutoPlayTimer = useCallback(() => {
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current)
      autoPlayTimerRef.current = null
    }
  }, [])

  // ---- Sleep timer helpers ----
  const clearSleepTimerInterval = useCallback(() => {
    if (sleepTimerIntervalRef.current) {
      clearInterval(sleepTimerIntervalRef.current)
      sleepTimerIntervalRef.current = null
    }
  }, [])

  const cancelFade = useCallback(() => {
    if (fadeCleanupRef.current) {
      fadeCleanupRef.current()
      fadeCleanupRef.current = null
      // Re-sync volume — the fade cleanup restores the pre-fade volume,
      // but the user may have adjusted volume during the fade
      const audio = audioRef.current
      if (audio) audio.volume = stateRef.current.volume
    }
  }, [])

  const triggerSleepTimerExpiry = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    clearSleepTimerInterval()
    cancelFade()
    clearAutoPlayTimer()

    if (audio.paused) {
      // Already paused — skip fade, just clear timer and notify
      dispatch({ type: "SET_BUFFERING", isBuffering: false })
      dispatch({ type: "CLEAR_SLEEP_TIMER" })
      toast(SLEEP_TIMER_TOAST)
      return
    }

    fadeCleanupRef.current = fadeOutAudio(audio, SLEEP_FADE_DURATION_MS, () => {
      fadeCleanupRef.current = null
      dispatch({ type: "SET_PLAYING", isPlaying: false })
      dispatch({ type: "SET_BUFFERING", isBuffering: false })
      dispatch({ type: "CLEAR_SLEEP_TIMER" })
      // Re-sync volume in case user adjusted it during the fade
      audio.volume = stateRef.current.volume
      toast(SLEEP_TIMER_TOAST)
    })
  }, [clearSleepTimerInterval, cancelFade, clearAutoPlayTimer])

  // Ref for stable access in intervals/event handlers without dependency churn
  const triggerSleepTimerExpiryRef = useRef(triggerSleepTimerExpiry)
  triggerSleepTimerExpiryRef.current = triggerSleepTimerExpiry

  const startSleepTimerCountdown = useCallback(
    (endTime: number) => {
      clearSleepTimerInterval()
      sleepTimerIntervalRef.current = setInterval(() => {
        const remaining = Math.max(
          0,
          Math.ceil((endTime - Date.now()) / 1000)
        )
        if (remaining <= 0) {
          triggerSleepTimerExpiryRef.current()
        }
      }, 1000)
    },
    [clearSleepTimerInterval]
  )

  // ---- Shared episode loading logic ----
  // Only accesses refs and dispatch (all stable), so safe to close over in
  // both the useMemo API and mount-time effects.
  const loadEpisodeIntoPlayer = (
    episode: AudioEpisode,
    options?: { andPlay?: boolean; startAt?: number }
  ) => {
    const audio = audioRef.current
    if (!audio) return

    const shouldPlay = options?.andPlay ?? true

    // Abort any in-flight chapter fetch from the previous episode
    chaptersFetchController.current?.abort()
    chaptersFetchController.current = null
    if (chaptersTimeoutRef.current) {
      clearTimeout(chaptersTimeoutRef.current)
      chaptersTimeoutRef.current = null
    }

    // Store pending seek position if startAt is provided and valid
    const requestedStartAt = options?.startAt
    pendingSeekRef.current =
      typeof requestedStartAt === "number" && Number.isFinite(requestedStartAt)
        ? Math.max(0, requestedStartAt)
        : null

    dispatch({ type: "PLAY_EPISODE", episode })
    audio.src = episode.audioUrl
    audio.load()

    if (shouldPlay) {
      audio.play().catch(() => {
        dispatch({ type: "SET_PLAYING", isPlaying: false })
        dispatch({ type: "SET_BUFFERING", isBuffering: false })
      })
    } else {
      dispatch({ type: "SET_PLAYING", isPlaying: false })
      dispatch({ type: "SET_BUFFERING", isBuffering: false })
    }

    updateMediaSessionMetadata({
      title: episode.title,
      artist: episode.podcastTitle,
      artwork: episode.artwork,
    })

    // Non-blocking chapter fetch when chaptersUrl is present
    if (episode.chaptersUrl) {
      const controller = new AbortController()
      chaptersFetchController.current = controller
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      chaptersTimeoutRef.current = timeoutId

      fetch(
        `/api/chapters?url=${encodeURIComponent(episode.chaptersUrl)}`,
        { signal: controller.signal }
      )
        .then((res) =>
          res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))
        )
        .then((data: { chapters: Chapter[] }) => {
          if (
            chaptersFetchController.current === controller &&
            !controller.signal.aborted
          ) {
            dispatch({ type: "SET_CHAPTERS", chapters: data.chapters })
          }
        })
        .catch(() => {
          if (chaptersFetchController.current === controller) {
            dispatch({ type: "CLEAR_CHAPTERS" })
          }
        })
        .finally(() => {
          clearTimeout(timeoutId)
          if (chaptersTimeoutRef.current === timeoutId) {
            chaptersTimeoutRef.current = null
          }
          if (chaptersFetchController.current === controller) {
            chaptersFetchController.current = null
          }
        })
    } else {
      dispatch({ type: "CLEAR_CHAPTERS" })
    }
  }

  // ---- API (stable reference) ----
  const api = useMemo<AudioPlayerAPI>(
    () => ({
      playEpisode: (episode: AudioEpisode, options?: { startAt?: number }) => {
        clearAutoPlayTimer()
        loadEpisodeIntoPlayer(episode, {
          andPlay: true,
          startAt: options?.startAt,
        })
      },

      togglePlay: () => {
        const audio = audioRef.current
        if (!audio || !audio.src) return
        if (audio.paused) {
          clearAutoPlayTimer()
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
        pendingSeekRef.current = null
        clearAutoPlayTimer()
        clearSleepTimerInterval()
        cancelFade()
        clearPlayerSession()
        if (sessionSaveTimerRef.current) {
          clearTimeout(sessionSaveTimerRef.current)
          sessionSaveTimerRef.current = null
        }
        chaptersFetchController.current?.abort()
        chaptersFetchController.current = null
        if (chaptersTimeoutRef.current) {
          clearTimeout(chaptersTimeoutRef.current)
          chaptersTimeoutRef.current = null
        }
        dispatch({ type: "CLOSE" })
        setProgress({ currentTime: 0, buffered: 0 })
        clearMediaSession()
        clearStallTimer()
      },

      addToQueue: (episode: AudioEpisode) => {
        const current = stateRef.current
        // If nothing is playing, play immediately instead of enqueuing
        if (!current.currentEpisode) {
          api.playEpisode(episode)
          return
        }
        // Don't add if currently playing (queue dedup handled by reducer)
        if (current.currentEpisode.id === episode.id) return
        dispatch({ type: "ADD_TO_QUEUE", episode })
      },

      removeFromQueue: (episodeId: string) => {
        dispatch({ type: "REMOVE_FROM_QUEUE", episodeId })
      },

      reorderQueue: (oldIndex: number, newIndex: number) => {
        dispatch({ type: "REORDER_QUEUE", oldIndex, newIndex })
      },

      clearQueue: () => {
        dispatch({ type: "CLEAR_QUEUE" })
      },

      playNext: () => {
        const current = stateRef.current
        if (current.queue.length === 0) return
        const next = current.queue[0]
        isAutoAdvancing.current = true
        api.playEpisode(next)
        dispatch({ type: "REMOVE_FROM_QUEUE", episodeId: next.id })
      },

      setSleepTimer: (option: number | "end-of-episode") => {
        // Cancel any existing timer first
        clearSleepTimerInterval()
        cancelFade()

        if (typeof option === "number" && (!Number.isFinite(option) || option <= 0)) {
          dispatch({ type: "CLEAR_SLEEP_TIMER" })
          return
        }

        if (option === "end-of-episode") {
          dispatch({
            type: "SET_SLEEP_TIMER",
            sleepTimer: { endTime: null, type: "end-of-episode" },
          })
        } else {
          const durationMs = option * MS_PER_MINUTE
          const endTime = Date.now() + durationMs
          dispatch({
            type: "SET_SLEEP_TIMER",
            sleepTimer: { endTime, type: "duration" },
          })
          startSleepTimerCountdown(endTime)
        }
      },

      cancelSleepTimer: () => {
        clearSleepTimerInterval()
        cancelFade()
        dispatch({ type: "CLEAR_SLEEP_TIMER" })
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable: actions close over refs
    []
  )

  // ---- Abort in-flight chapter fetch on unmount ----
  useEffect(() => {
    return () => {
      chaptersFetchController.current?.abort()
      if (chaptersTimeoutRef.current) {
        clearTimeout(chaptersTimeoutRef.current)
      }
    }
  }, [])

  // ---- Media Session handlers ----
  useEffect(() => {
    setupMediaSessionHandlers({
      onPlay: api.togglePlay,
      onPause: api.togglePlay,
      onSeekBackward: () => api.skipBack(),
      onSeekForward: () => api.skipForward(),
      onStop: api.closePlayer,
      onNextTrack: () => {
        if (stateRef.current.queue.length > 0) api.playNext()
      },
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

      // Throttled session save (~5s) — skip until session restore is complete
      if (
        isSessionRestored.current &&
        !sessionSaveTimerRef.current &&
        stateRef.current.currentEpisode
      ) {
        sessionSaveTimerRef.current = setTimeout(() => {
          sessionSaveTimerRef.current = null
          const ep = stateRef.current.currentEpisode
          if (ep) {
            savePlayerSession(ep, audio.currentTime)
          }
        }, 5000)
      }

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
      // Apply pending seek when the audio element reports a valid duration
      if (
        pendingSeekRef.current !== null &&
        audio.duration > 0 &&
        !isNaN(audio.duration)
      ) {
        audio.currentTime = Math.min(pendingSeekRef.current, audio.duration)
        pendingSeekRef.current = null
      }
    }

    const onPlaying = () => {
      clearAutoPlayTimer()
      dispatch({ type: "SET_PLAYING", isPlaying: true })
      dispatch({ type: "SET_BUFFERING", isBuffering: false })
      dispatch({ type: "CLEAR_ERROR" })
      isAutoAdvancing.current = false
      clearStallTimer()
      // If user resumes during a sleep timer fade, cancel it
      if (fadeCleanupRef.current) {
        cancelFade()
        dispatch({ type: "CLEAR_SLEEP_TIMER" })
      }
    }

    const onPause = () => {
      dispatch({ type: "SET_PLAYING", isPlaying: false })
      clearStallTimer()
      // Save exact pause position immediately
      if (isSessionRestored.current && stateRef.current.currentEpisode) {
        savePlayerSession(stateRef.current.currentEpisode, audio.currentTime)
      }
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

      // End-of-episode sleep timer: fade out and skip auto-play-next
      if (stateRef.current.sleepTimer?.type === "end-of-episode") {
        triggerSleepTimerExpiryRef.current()
        return
      }

      const currentQueue = stateRef.current.queue
      if (currentQueue.length > 0) {
        const nextEpisode = currentQueue[0]
        toast(`Playing next: ${nextEpisode.title}`, {
          duration: 3000,
          action: {
            label: "Cancel",
            onClick: () => {
              clearAutoPlayTimer()
            },
          },
        })

        clearAutoPlayTimer()
        autoPlayTimerRef.current = setTimeout(() => {
          autoPlayTimerRef.current = null
          api.playNext()
        }, 3000)
      }
    }

    const onError = () => {
      const errorCode = audio.error?.code ?? 0
      const message = getMediaErrorMessage(errorCode)
      clearStallTimer()

      if (isAutoAdvancing.current) {
        // Error during auto-advance — stop the chain
        const failedEpisode = stateRef.current.currentEpisode
        isAutoAdvancing.current = false
        api.closePlayer()
        if (failedEpisode) {
          dispatch({ type: "REMOVE_FROM_QUEUE", episodeId: failedEpisode.id })
          toast.error(`Couldn't play ${failedEpisode.title} \u2014 removed from queue`)
        }
        return
      }

      dispatch({ type: "SET_ERROR", message })
      toast.error("Playback error", { description: message })
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
      clearAutoPlayTimer()
      if (ariaTimerRef.current) {
        clearTimeout(ariaTimerRef.current)
      }
      if (sessionSaveTimerRef.current) {
        clearTimeout(sessionSaveTimerRef.current)
        sessionSaveTimerRef.current = null
      }
    }
  }, [clearStallTimer, startStallTimer, clearAutoPlayTimer, api, cancelFade])

  // ---- Save session on tab close ----
  useEffect(() => {
    const onBeforeUnload = () => {
      const ep = stateRef.current.currentEpisode
      const audio = audioRef.current
      if (ep && audio && isSessionRestored.current) {
        savePlayerSession(ep, audio.currentTime)
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  // ---- Check sleep timer expiry on tab visibility change ----
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return
      const timer = stateRef.current.sleepTimer
      if (!timer || timer.type !== "duration" || timer.endTime === null) return
      const remaining = Math.max(
        0,
        Math.ceil((timer.endTime - Date.now()) / 1000)
      )
      if (remaining <= 0) {
        triggerSleepTimerExpiryRef.current()
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  // ---- Clean up sleep timer on unmount ----
  useEffect(() => {
    return () => {
      clearSleepTimerInterval()
      cancelFade()
    }
  }, [clearSleepTimerInterval, cancelFade])

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
