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
import { useAuth } from "@clerk/nextjs"
import {
  clearAllUserLocalData,
  getLastUserId,
  hasQueueMigrated,
  hasSessionMigrated,
  markQueueMigrated,
  markSessionMigrated,
  setLastUserId,
} from "@/lib/migration-marker"
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
import type { AudioEpisode } from "@/lib/schemas/listening-queue"
import { recordListenEvent } from "@/app/actions/listen-history"
import {
  getQueue,
  setQueue as setQueueAction,
} from "@/app/actions/listening-queue"
import {
  getPlayerSession,
  savePlayerSession as savePlayerSessionAction,
  clearPlayerSession as clearPlayerSessionAction,
} from "@/app/actions/player-session"

// ---------------------------------------------------------------------------
// Server-sync helpers (fire-and-forget; best-effort with warn-on-failure)
// ---------------------------------------------------------------------------

type SessionSaveSite = "throttle" | "pause" | "beforeunload"

function persistSessionToServer(
  episode: AudioEpisode,
  currentTime: number,
  site: SessionSaveSite
): void {
  savePlayerSessionAction(episode, currentTime)
    .then((r) => {
      if (!r.success) console.warn("[player] save failed", { site, error: r.error })
    })
    .catch((err) => console.warn("[player] save threw", { site, err }))
}

function clearSessionOnServer(): void {
  clearPlayerSessionAction()
    .then((r) => {
      if (!r.success) console.warn("[player] clear failed:", r.error)
    })
    .catch((err) => console.warn("[player] clear threw:", err))
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SleepTimerType = "duration" | "end-of-episode"

export interface SleepTimerState {
  /** Absolute time (Date.now() ms) when the timer expires. Null for end-of-episode. */
  endTime: number | null
  type: SleepTimerType
}

export type { AudioEpisode }

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

export const SKIP_BACK_SECONDS = 10
export const SKIP_FORWARD_SECONDS = 30
const STALL_TIMEOUT_MS = 10_000
const SLEEP_FADE_DURATION_MS = 3000
const MS_PER_MINUTE = 60_000
const SLEEP_TIMER_TOAST = "Sleep timer — playback paused"
const MAX_LISTEN_HISTORY_RETRIES = 3

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
  const { userId, isLoaded: isAuthLoaded } = useAuth()
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
  const isRestoringSession = useRef(false)
  const isSessionRestored = useRef(false)
  // Tracks listen-history "started" attempts per episode this session.
  // Value = attempt count. Once succeeded or MAX_LISTEN_HISTORY_RETRIES reached, no more attempts.
  // Intentionally NOT cleared on replay — upsert COALESCE preserves first startedAt,
  // so re-firing after success would be a no-op server call.
  const listenHistoryFiredRef = useRef<Map<string, number>>(new Map())

  // Cross-device sync refs
  // Counter instead of boolean: stays > 0 while any debounce timer is scheduled OR
  // any setQueueAction is in-flight, preventing a concurrent focus refetch from
  // clobbering an unacked local mutation even across sequential writes.
  // See ADR-036.
  const pendingQueueWriteRef = useRef(0)
  const lastAckedQueueRef = useRef<AudioEpisode[]>([])
  const queueDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set to true when dispatching INIT_QUEUE from a server reconcile; prevents the
  // queue-persist effect from scheduling a write back to the server for that change.
  const suppressQueueWriteRef = useRef(false)

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
    // Seed lastAckedQueueRef so the persist effect's first run sees currentIds ===
    // ackedIds and skips scheduling a spurious setQueue write. Without this, the
    // cached local queue would overwrite the server state on every cold boot.
    lastAckedQueueRef.current = persisted
    dispatch({ type: "INIT_QUEUE", queue: persisted })
    isQueueHydrated.current = true
  }, [])

  // ---- Restore session from localStorage on mount ----
  useEffect(() => {
    const session = loadPlayerSession()
    if (session) {
      isRestoringSession.current = true
      loadEpisodeIntoPlayer(session.episode, {
        andPlay: false,
        startAt: session.currentTime,
      })
      // isSessionRestored is set in onDurationChange after the seek is applied,
      // preventing beforeunload from saving currentTime: 0 during the gap.
      return
    }
    isSessionRestored.current = true
  }, [])

  // ---- Server-sync: parallel getQueue + getPlayerSession, reconcile, migrate ----
  // Runs whenever Clerk finishes loading OR `userId` changes. Without the
  // `isAuthLoaded && userId` gate on the deps, a first-render pre-hydration
  // pass would call the server actions, get Unauthorized, and never retry
  // (the effect had `[]` deps), leaving cross-device state unsynced and
  // — worse — letting an empty server response wipe a non-empty local queue.
  useEffect(() => {
    if (!isAuthLoaded || !userId) return
    // Bind the narrowed userId for the nested async closure — TypeScript
    // doesn't propagate the guard across the function boundary.
    const activeUserId = userId
    let cancelled = false

    async function syncOnMount() {
      // User-switch guard (ADR-036): if a different user is signed in on this
      // browser, wipe the prior user's localStorage BEFORE reconciling against
      // the server — otherwise User A's cached queue/session would leak into
      // User B's account on the first write.
      const lastUserId = getLastUserId()
      if (lastUserId && lastUserId !== activeUserId) {
        clearAllUserLocalData()
        suppressQueueWriteRef.current = true
        dispatch({ type: "INIT_QUEUE", queue: [] })
        lastAckedQueueRef.current = []
        // Reset player state (no clearSession flag — the server session
        // belongs to the new user, we don't want to delete it).
        teardownPlayer()
      }
      setLastUserId(activeUserId)

      let queueResult: Awaited<ReturnType<typeof getQueue>>
      let sessionResult: Awaited<ReturnType<typeof getPlayerSession>>
      try {
        ;[queueResult, sessionResult] = await Promise.all([
          getQueue(),
          getPlayerSession(),
        ])
      } catch (err) {
        console.error("Failed to fetch cross-device sync state on mount:", err)
        return
      }

      if (cancelled) return

      // Reconcile queue — gated by per-user migration marker so a queue
      // cleared on another device isn't resurrected by this browser's cache.
      const localQueue = loadQueue()
      if (queueResult.success) {
        const serverQueue = queueResult.data
        const hasMigrated = hasQueueMigrated(activeUserId)
        if (serverQueue.length === 0) {
          if (localQueue.length > 0 && !hasMigrated) {
            // One-time upload of pre-sync local queue
            pendingQueueWriteRef.current++
            try {
              const result = await setQueueAction(localQueue)
              if (result.success) {
                lastAckedQueueRef.current = localQueue
                markQueueMigrated(activeUserId)
              } else {
                console.error("Queue migration failed:", result.error)
                toast.error("Couldn't sync your queue", {
                  description:
                    "Your local queue didn't upload. We'll try again on the next change.",
                })
              }
            } catch (err) {
              console.error("Queue migration threw:", err)
              toast.error("Couldn't sync your queue", {
                description:
                  "Your local queue didn't upload. We'll try again on the next change.",
              })
            } finally {
              pendingQueueWriteRef.current--
            }
          } else if (localQueue.length > 0 && hasMigrated) {
            // Server is authoritative empty — user cleared on another device.
            suppressQueueWriteRef.current = true
            lastAckedQueueRef.current = []
            dispatch({ type: "INIT_QUEUE", queue: [] })
            saveQueue([])
          } else {
            lastAckedQueueRef.current = []
            if (!hasMigrated) markQueueMigrated(activeUserId)
          }
        } else if (serverQueue.length > 0) {
          if (!pendingQueueWriteRef.current) {
            lastAckedQueueRef.current = serverQueue
            dispatch({ type: "INIT_QUEUE", queue: serverQueue })
            if (!hasMigrated) markQueueMigrated(activeUserId)
          }
        }
      } else {
        console.warn("Mount getQueue failed:", queueResult.error)
      }

      if (cancelled) return

      // Reconcile session — symmetric to queue. Empty server + migrated user
      // means "explicitly cleared elsewhere"; empty server + unmigrated means
      // "never synced before — upload local as one-time migration."
      if (sessionResult.success) {
        if (sessionResult.data) {
          reconcileServerSession(sessionResult.data)
          if (!hasSessionMigrated(activeUserId)) markSessionMigrated(activeUserId)
        } else {
          const localEp = stateRef.current.currentEpisode
          const audio = audioRef.current
          const hasLocal = localEp !== null
          const migrated = hasSessionMigrated(activeUserId)
          if (hasLocal && !migrated) {
            // One-time upload of pre-sync local session
            const t = audio?.currentTime ?? 0
            savePlayerSessionAction(localEp, t)
              .then((r) => {
                if (!r.success)
                  console.warn("[player] session migration failed", r.error)
              })
              .catch((err) =>
                console.warn("[player] session migration threw", err)
              )
            markSessionMigrated(activeUserId)
          } else if (hasLocal && migrated) {
            // Server authoritative empty — close the locally restored player.
            teardownPlayer({ clearSession: true })
          } else if (!hasLocal && !migrated) {
            markSessionMigrated(activeUserId)
          }
        }
      } else {
        console.warn("Mount getPlayerSession failed:", sessionResult.error)
      }
    }

    void syncOnMount()
    return () => { cancelled = true }
  // Only `isAuthLoaded`/`userId` gate the effect. `reconcileServerSession`,
  // `loadEpisodeIntoPlayer`, and the provider-scope helpers are closed over
  // and change identity every render; re-running on those would re-trigger
  // the cross-device fetch continuously.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoaded, userId])

  // ---- Focus/visibilitychange refetch: reconcile server state (200ms debounce) ----
  useEffect(() => {
    function scheduleRefetch() {
      if (focusDebounceTimerRef.current) {
        clearTimeout(focusDebounceTimerRef.current)
      }
      focusDebounceTimerRef.current = setTimeout(async () => {
        focusDebounceTimerRef.current = null

        let queueResult: Awaited<ReturnType<typeof getQueue>>
        let sessionResult: Awaited<ReturnType<typeof getPlayerSession>>
        try {
          ;[queueResult, sessionResult] = await Promise.all([
            getQueue(),
            getPlayerSession(),
          ])
        } catch (err) {
          console.error("Focus refetch failed:", err)
          return
        }

        // Queue reconcile: skip if a local write is pending
        if (queueResult.success && !pendingQueueWriteRef.current) {
          lastAckedQueueRef.current = queueResult.data
          dispatch({ type: "INIT_QUEUE", queue: queueResult.data })
        } else if (!queueResult.success) {
          console.warn("Focus getQueue failed:", queueResult.error)
        }

        // Session reconcile
        if (sessionResult.success && sessionResult.data) {
          reconcileServerSession(sessionResult.data)
        } else if (!sessionResult.success) {
          console.warn("Focus getPlayerSession failed:", sessionResult.error)
        }
      }, 200)
    }

    const onVisibilityFocus = () => {
      if (document.visibilityState === "visible") scheduleRefetch()
    }

    window.addEventListener("focus", scheduleRefetch)
    document.addEventListener("visibilitychange", onVisibilityFocus)
    return () => {
      window.removeEventListener("focus", scheduleRefetch)
      document.removeEventListener("visibilitychange", onVisibilityFocus)
      if (focusDebounceTimerRef.current) {
        clearTimeout(focusDebounceTimerRef.current)
        focusDebounceTimerRef.current = null
      }
    }
  // Mount-only: registers focus + visibilitychange listeners once. The
  // `reconcileServerSession` closure captures refs only, so listener
  // reinstallation on every render would thrash for no behavior change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Persist queue to localStorage + debounced server write ----
  useEffect(() => {
    if (!isQueueHydrated.current) return

    saveQueue(state.queue)

    // Skip server write if this queue change originated from a server reconcile
    // or a rollback-triggered INIT_QUEUE. Check this BEFORE the acked-IDs
    // early return — otherwise a rollback (which restores the acked queue by
    // definition) would bail on ID equality and leave the suppress flag set,
    // silently dropping the next real user mutation.
    if (suppressQueueWriteRef.current) {
      suppressQueueWriteRef.current = false
      return
    }

    // Skip server write if the queue matches the last server-acked state (no user mutation)
    const currentIds = state.queue.map((ep) => ep.id).join(",")
    const ackedIds = lastAckedQueueRef.current.map((ep) => ep.id).join(",")
    if (currentIds === ackedIds) return

    // Trailing-edge 1500ms debounce: collapses rapid reorders into a single setQueue call.
    // Increment the counter when scheduling so the flag stays > 0 while any timer or
    // in-flight write is outstanding (prevents focus-refetch from clobbering).
    if (queueDebounceTimerRef.current) {
      clearTimeout(queueDebounceTimerRef.current)
      pendingQueueWriteRef.current-- // cancel the previously scheduled increment
    }
    const snapshot = state.queue.slice()
    pendingQueueWriteRef.current++
    queueDebounceTimerRef.current = setTimeout(async () => {
      queueDebounceTimerRef.current = null
      try {
        const result = await setQueueAction(snapshot)
        if (result.success) {
          lastAckedQueueRef.current = snapshot
        } else {
          toast.error("Couldn't sync queue", {
            description: "Your queue change couldn't be saved. Rolling back.",
          })
          suppressQueueWriteRef.current = true
          dispatch({ type: "INIT_QUEUE", queue: lastAckedQueueRef.current })
        }
      } catch {
        toast.error("Couldn't sync queue", {
          description: "Your queue change couldn't be saved. Rolling back.",
        })
        suppressQueueWriteRef.current = true
        dispatch({ type: "INIT_QUEUE", queue: lastAckedQueueRef.current })
      } finally {
        pendingQueueWriteRef.current--
      }
    }, 1500)

    return () => {
      if (queueDebounceTimerRef.current) {
        clearTimeout(queueDebounceTimerRef.current)
        queueDebounceTimerRef.current = null
        // Balance the increment that scheduled this debounced write. The
        // lint rule assumes refs point to DOM nodes that may unmount; this
        // one is a plain counter, so reading the live value is intentional.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        pendingQueueWriteRef.current--
      }
    }
  // Only `state.queue` is a reactive dep. `setQueueAction` is a stable import,
  // and the refs / `dispatch` are stable by React contract.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Cancel any pending session-save timer from the previous episode
    if (sessionSaveTimerRef.current) {
      clearTimeout(sessionSaveTimerRef.current)
      sessionSaveTimerRef.current = null
    }

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

  // ---- Reconcile a server-fetched session into the player ----
  // Shared by mount-sync and focus-refetch. Preserves the never-rewind
  // invariant: if the same episode is actively playing, server currentTime
  // is ignored.
  const reconcileServerSession = (serverSession: {
    episode: AudioEpisode
    currentTime: number
  }) => {
    const currentEp = stateRef.current.currentEpisode
    const audio = audioRef.current
    const isActivelyPlaying = audio
      ? !audio.paused
      : stateRef.current.isPlaying
    const sameEpisode =
      currentEp && currentEp.id === serverSession.episode.id

    if (sameEpisode && isActivelyPlaying) {
      return
    }
    if (sameEpisode && !isActivelyPlaying) {
      if (audio && Number.isFinite(serverSession.currentTime)) {
        pendingSeekRef.current = serverSession.currentTime
        if (audio.duration > 0 && !isNaN(audio.duration)) {
          audio.currentTime = Math.min(
            serverSession.currentTime,
            audio.duration
          )
          pendingSeekRef.current = null
        }
      }
      return
    }
    isRestoringSession.current = true
    loadEpisodeIntoPlayer(serverSession.episode, {
      andPlay: false,
      startAt: serverSession.currentTime,
    })
  }

  // ---- Shared player teardown ----
  // Resets the audio element and all player state. Only clears the persisted
  // session when the user explicitly closes the player (not on auto-advance errors).
  const teardownPlayer = useCallback(
    (options?: { clearSession?: boolean }) => {
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
      if (options?.clearSession) {
        clearPlayerSession() // localStorage cache
        clearSessionOnServer() // server source of truth
      }
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
    [clearAutoPlayTimer, clearSleepTimerInterval, cancelFade, clearStallTimer]
  )

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

      skipForward: (seconds = SKIP_FORWARD_SECONDS) => {
        const audio = audioRef.current
        if (!audio) return
        audio.currentTime = Math.min(
          audio.currentTime + seconds,
          audio.duration || 0
        )
      },

      skipBack: (seconds = SKIP_BACK_SECONDS) => {
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
        teardownPlayer({ clearSession: true })
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
            savePlayerSession(ep, audio.currentTime) // localStorage cache
            persistSessionToServer(ep, audio.currentTime, "throttle")
          }
        }, 5000)
      }

      // Fire listen history "started" event once at 30s threshold (retry up to MAX_LISTEN_HISTORY_RETRIES)
      if (
        audio.currentTime >= 30 &&
        stateRef.current.currentEpisode
      ) {
        const ep = stateRef.current.currentEpisode
        const attempts = listenHistoryFiredRef.current.get(ep.id) ?? 0
        if (attempts < MAX_LISTEN_HISTORY_RETRIES) {
          // Block re-entry while the async call is in-flight
          listenHistoryFiredRef.current.set(ep.id, MAX_LISTEN_HISTORY_RETRIES)
          void (async () => {
            try {
              const result = await recordListenEvent({
                podcastIndexEpisodeId: ep.id,
              })
              if (!result?.success) {
                listenHistoryFiredRef.current.set(ep.id, attempts + 1)
              }
            } catch {
              listenHistoryFiredRef.current.set(ep.id, attempts + 1)
            }
          })()
        }
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
      // Mark session restoration complete once the seek has been applied
      if (isRestoringSession.current && pendingSeekRef.current === null) {
        isRestoringSession.current = false
        isSessionRestored.current = true
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
      // Save exact pause position immediately (locally AND to the server so a
      // pause on Device A reflects on Device B without waiting for the 5s throttle).
      // Clear any pending throttled save — the immediate pause save supersedes it.
      if (sessionSaveTimerRef.current) {
        clearTimeout(sessionSaveTimerRef.current)
        sessionSaveTimerRef.current = null
      }
      if (isSessionRestored.current && stateRef.current.currentEpisode) {
        const ep = stateRef.current.currentEpisode
        savePlayerSession(ep, audio.currentTime) // localStorage cache
        persistSessionToServer(ep, audio.currentTime, "pause")
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

      // Record listen history completion
      if (stateRef.current.currentEpisode) {
        const ep = stateRef.current.currentEpisode
        void recordListenEvent({
          podcastIndexEpisodeId: ep.id,
          completed: true,
          durationSeconds: isFinite(audio.duration)
            ? Math.floor(audio.duration)
            : undefined,
        })
      }

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
        // Error during auto-advance — stop the chain but preserve the saved
        // session so the user can resume the previous episode on refresh
        const failedEpisode = stateRef.current.currentEpisode
        isAutoAdvancing.current = false
        teardownPlayer()
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
  }, [clearStallTimer, startStallTimer, clearAutoPlayTimer, api, cancelFade, teardownPlayer])

  // ---- Save session on tab close ----
  useEffect(() => {
    const onBeforeUnload = () => {
      const ep = stateRef.current.currentEpisode
      const audio = audioRef.current
      if (ep && audio && isSessionRestored.current) {
        savePlayerSession(ep, audio.currentTime) // localStorage cache
        // beforeunload can't await; the browser may drop the request, but
        // the helper attaches its own .catch so rejections aren't unhandled.
        persistSessionToServer(ep, audio.currentTime, "beforeunload")
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
