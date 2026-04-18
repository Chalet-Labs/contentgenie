import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  AudioPlayerProvider,
  useAudioPlayerAPI,
  useAudioPlayerState,
  useAudioPlayerProgress,
  type AudioEpisode,
} from "@/contexts/audio-player-context"

// Mock media-session helpers
vi.mock("@/lib/media-session", () => ({
  updateMediaSessionMetadata: vi.fn(),
  setupMediaSessionHandlers: vi.fn(),
  updateMediaSessionPosition: vi.fn(),
  clearMediaSession: vi.fn(),
}))

// Mock recordListenEvent server action
const mockRecordListenEvent = vi.fn().mockResolvedValue({ success: true })
vi.mock("@/app/actions/listen-history", () => ({
  recordListenEvent: (...args: unknown[]) => mockRecordListenEvent(...args),
}))

// Mock player-preferences helpers
const mockLoadPrefs = vi.fn().mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
const mockSavePrefs = vi.fn()
vi.mock("@/lib/player-preferences", () => ({
  loadPlayerPreferences: (...args: unknown[]) => mockLoadPrefs(...args),
  savePlayerPreferences: (...args: unknown[]) => mockSavePrefs(...args),
}))

// Mock queue-persistence helpers
const mockLoadQueue = vi.fn().mockReturnValue([])
const mockSaveQueue = vi.fn()
vi.mock("@/lib/queue-persistence", () => ({
  loadQueue: (...args: unknown[]) => mockLoadQueue(...args),
  saveQueue: (...args: unknown[]) => mockSaveQueue(...args),
}))

// Mock player-session helpers
const mockLoadSession = vi.fn().mockReturnValue(null)
const mockSaveSession = vi.fn()
const mockClearSession = vi.fn()
vi.mock("@/lib/player-session", () => ({
  loadPlayerSession: (...args: unknown[]) => mockLoadSession(...args),
  savePlayerSession: (...args: unknown[]) => mockSaveSession(...args),
  clearPlayerSession: (...args: unknown[]) => mockClearSession(...args),
}))

// --- Mock HTMLMediaElement prototype ---
// jsdom doesn't implement play/load/pause, so we stub them globally
const playMock = vi.fn().mockResolvedValue(undefined)
const pauseMock = vi.fn()
const loadMock = vi.fn()

function getAudioElement(): HTMLAudioElement | null {
  return document.querySelector("audio")
}

function fireAudioEvent(eventName: string) {
  const audio = getAudioElement()
  if (audio) {
    audio.dispatchEvent(new Event(eventName))
  }
}

beforeEach(() => {
  // Stub HTMLMediaElement methods
  HTMLMediaElement.prototype.play = playMock
  HTMLMediaElement.prototype.pause = pauseMock
  HTMLMediaElement.prototype.load = loadMock

  // Provide a buffered TimeRanges stub
  Object.defineProperty(HTMLMediaElement.prototype, "buffered", {
    configurable: true,
    get() {
      return {
        length: 1,
        start: () => 0,
        end: () => 150,
      }
    },
  })
})

const mockEpisode: AudioEpisode = {
  id: "ep-123",
  title: "Test Episode",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://example.com/art.jpg",
  duration: 600,
}

const queueEpisode1: AudioEpisode = {
  id: "q-1",
  title: "Queue Episode 1",
  podcastTitle: "Queue Podcast",
  audioUrl: "https://example.com/q1.mp3",
  duration: 300,
}

const queueEpisode2: AudioEpisode = {
  id: "q-2",
  title: "Queue Episode 2",
  podcastTitle: "Queue Podcast",
  audioUrl: "https://example.com/q2.mp3",
  duration: 400,
}

const queueEpisode3: AudioEpisode = {
  id: "q-3",
  title: "Queue Episode 3",
  podcastTitle: "Queue Podcast",
  audioUrl: "https://example.com/q3.mp3",
  duration: 500,
}

// Test consumer component
function TestConsumer() {
  const state = useAudioPlayerState()
  const api = useAudioPlayerAPI()
  const progress = useAudioPlayerProgress()

  return (
    <div>
      <span data-testid="isPlaying">{String(state.isPlaying)}</span>
      <span data-testid="isVisible">{String(state.isVisible)}</span>
      <span data-testid="isBuffering">{String(state.isBuffering)}</span>
      <span data-testid="volume">{state.volume}</span>
      <span data-testid="playbackSpeed">{state.playbackSpeed}</span>
      <span data-testid="hasError">{String(state.hasError)}</span>
      <span data-testid="errorMessage">{state.errorMessage ?? ""}</span>
      <span data-testid="duration">{state.duration}</span>
      <span data-testid="currentTime">{progress.currentTime}</span>
      <span data-testid="buffered">{progress.buffered}</span>
      <span data-testid="episodeTitle">{state.currentEpisode?.title ?? ""}</span>
      <span data-testid="queueLength">{state.queue.length}</span>
      <span data-testid="queueIds">{state.queue.map((ep) => ep.id).join(",")}</span>
      <button onClick={() => api.playEpisode(mockEpisode)}>Play Episode</button>
      <button onClick={api.togglePlay}>Toggle Play</button>
      <button onClick={() => api.seek(120)}>Seek 120</button>
      <button onClick={() => api.skipForward()}>Skip Forward</button>
      <button onClick={() => api.skipBack()}>Skip Back</button>
      <button onClick={() => api.setVolume(0.5)}>Set Volume</button>
      <button onClick={() => api.setPlaybackSpeed(2)}>Set Speed</button>
      <button onClick={api.closePlayer}>Close</button>
      <button onClick={() => api.addToQueue(queueEpisode1)}>Add Q1</button>
      <button onClick={() => api.addToQueue(queueEpisode2)}>Add Q2</button>
      <button onClick={() => api.addToQueue(queueEpisode3)}>Add Q3</button>
      <button onClick={() => api.removeFromQueue("q-1")}>Remove Q1</button>
      <button onClick={() => api.reorderQueue(0, 2)}>Reorder 0→2</button>
      <button onClick={api.clearQueue}>Clear Queue</button>
      <button onClick={api.playNext}>Play Next</button>
    </div>
  )
}

describe("AudioPlayerProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playMock.mockResolvedValue(undefined)
    mockLoadPrefs.mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
    mockLoadQueue.mockReturnValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("provides default state from localStorage preferences", () => {
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    expect(screen.getByTestId("isPlaying")).toHaveTextContent("false")
    expect(screen.getByTestId("isVisible")).toHaveTextContent("false")
    expect(screen.getByTestId("volume")).toHaveTextContent("0.8")
    expect(screen.getByTestId("playbackSpeed")).toHaveTextContent("1.5")
    expect(screen.getByTestId("hasError")).toHaveTextContent("false")
  })

  it("plays an episode and updates state", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))

    expect(screen.getByTestId("episodeTitle")).toHaveTextContent(mockEpisode.title)
    expect(screen.getByTestId("isVisible")).toHaveTextContent("true")
    expect(playMock).toHaveBeenCalled()
  })

  it("toggles play/pause", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    // Play episode first
    await user.click(screen.getByText("Play Episode"))

    // Simulate audio playing
    const audio = getAudioElement()!
    Object.defineProperty(audio, "paused", { value: false, configurable: true })
    await user.click(screen.getByText("Toggle Play"))
    expect(pauseMock).toHaveBeenCalled()

    // Now paused — toggle should play
    Object.defineProperty(audio, "paused", { value: true, configurable: true })
    await user.click(screen.getByText("Toggle Play"))
    // play called: once from playEpisode + once from togglePlay
    expect(playMock).toHaveBeenCalledTimes(2)
  })

  it("seeks to a specific time", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))

    const audio = getAudioElement()!
    Object.defineProperty(audio, "duration", { value: 600, configurable: true })
    await user.click(screen.getByText("Seek 120"))
    expect(audio.currentTime).toBe(120)
  })

  it("skips forward by 15 seconds", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    const audio = getAudioElement()!
    audio.currentTime = 100
    Object.defineProperty(audio, "duration", { value: 600, configurable: true })
    await user.click(screen.getByText("Skip Forward"))
    expect(audio.currentTime).toBe(115)
  })

  it("skips back by 15 seconds", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    const audio = getAudioElement()!
    audio.currentTime = 100
    await user.click(screen.getByText("Skip Back"))
    expect(audio.currentTime).toBe(85)
  })

  it("does not skip back below zero", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    const audio = getAudioElement()!
    audio.currentTime = 5
    await user.click(screen.getByText("Skip Back"))
    expect(audio.currentTime).toBe(0)
  })

  it("sets volume and persists to localStorage", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Set Volume"))
    expect(screen.getByTestId("volume")).toHaveTextContent("0.5")
    expect(mockSavePrefs).toHaveBeenCalledWith({ volume: 0.5 })
  })

  it("sets playback speed and persists to localStorage", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Set Speed"))
    expect(screen.getByTestId("playbackSpeed")).toHaveTextContent("2")
    expect(mockSavePrefs).toHaveBeenCalledWith({ playbackSpeed: 2 })
  })

  it("closes player and resets state", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    expect(screen.getByTestId("isVisible")).toHaveTextContent("true")

    await user.click(screen.getByText("Close"))
    expect(screen.getByTestId("isVisible")).toHaveTextContent("false")
    expect(screen.getByTestId("isPlaying")).toHaveTextContent("false")
    expect(screen.getByTestId("episodeTitle")).toHaveTextContent("")
    expect(pauseMock).toHaveBeenCalled()
  })

  it("dispatches playing/pause from audio events", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))

    // Simulate 'playing' event
    act(() => fireAudioEvent("playing"))
    expect(screen.getByTestId("isPlaying")).toHaveTextContent("true")
    expect(screen.getByTestId("isBuffering")).toHaveTextContent("false")

    // Simulate 'pause' event
    act(() => fireAudioEvent("pause"))
    expect(screen.getByTestId("isPlaying")).toHaveTextContent("false")
  })

  it("dispatches buffering state from waiting event", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    act(() => fireAudioEvent("waiting"))
    expect(screen.getByTestId("isBuffering")).toHaveTextContent("true")
  })

  it("dispatches error state from error event", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    const audio = getAudioElement()!
    Object.defineProperty(audio, "error", {
      value: { code: 2 }, // MEDIA_ERR_NETWORK
      configurable: true,
    })
    act(() => fireAudioEvent("error"))
    expect(screen.getByTestId("hasError")).toHaveTextContent("true")
    expect(screen.getByTestId("errorMessage")).toHaveTextContent(
      "A network error occurred while loading audio."
    )
  })

  it("updates duration from durationchange event", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    const audio = getAudioElement()!
    Object.defineProperty(audio, "duration", { value: 1200, configurable: true })
    act(() => fireAudioEvent("durationchange"))
    expect(screen.getByTestId("duration")).toHaveTextContent("1200")
  })

  it("sets up Media Session handlers on mount", async () => {
    const { setupMediaSessionHandlers } = await import("@/lib/media-session")
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )
    expect(setupMediaSessionHandlers).toHaveBeenCalled()
  })

  it("renders hidden audio element and aria-live region", () => {
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    expect(document.querySelector("audio")).toBeTruthy()
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("handles autoplay blocked (play rejection)", async () => {
    playMock.mockRejectedValueOnce(new DOMException("NotAllowedError"))
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    // Should set isPlaying to false after rejection
    expect(screen.getByTestId("isPlaying")).toHaveTextContent("false")
  })
})

describe("Queue state management", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playMock.mockResolvedValue(undefined)
    mockLoadPrefs.mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
    mockLoadQueue.mockReturnValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("addToQueue adds episode when something is already playing", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    // Play something first
    await user.click(screen.getByText("Play Episode"))
    expect(screen.getByTestId("episodeTitle")).toHaveTextContent("Test Episode")

    // Add to queue
    await user.click(screen.getByText("Add Q1"))
    expect(screen.getByTestId("queueLength")).toHaveTextContent("1")
    expect(screen.getByTestId("queueIds")).toHaveTextContent("q-1")
  })

  it("addToQueue plays immediately when nothing is playing", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    // Nothing is playing — addToQueue should play immediately
    await user.click(screen.getByText("Add Q1"))
    expect(screen.getByTestId("episodeTitle")).toHaveTextContent("Queue Episode 1")
    expect(screen.getByTestId("isVisible")).toHaveTextContent("true")
    expect(screen.getByTestId("queueLength")).toHaveTextContent("0")
  })

  it("addToQueue deduplicates by ID", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    await user.click(screen.getByText("Add Q1"))
    await user.click(screen.getByText("Add Q1"))
    expect(screen.getByTestId("queueLength")).toHaveTextContent("1")
  })

  it("addToQueue does not add currently playing episode", async () => {
    const user = userEvent.setup()
    function CurrentEpisodeQueueConsumer() {
      const state = useAudioPlayerState()
      const api = useAudioPlayerAPI()
      return (
        <div>
          <span data-testid="queueLength">{state.queue.length}</span>
          <span data-testid="episodeTitle">{state.currentEpisode?.title ?? ""}</span>
          <button onClick={() => api.playEpisode(mockEpisode)}>Play Episode</button>
          <button onClick={() => api.addToQueue(mockEpisode)}>Add Playing To Queue</button>
          <button onClick={() => api.addToQueue(queueEpisode1)}>Add Q1</button>
        </div>
      )
    }
    render(
      <AudioPlayerProvider>
        <CurrentEpisodeQueueConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    expect(screen.getByTestId("episodeTitle")).toHaveTextContent("Test Episode")

    // Try to add the currently playing episode to queue — should be a no-op
    await user.click(screen.getByText("Add Playing To Queue"))
    expect(screen.getByTestId("queueLength")).toHaveTextContent("0")

    // Adding a different episode should work
    await user.click(screen.getByText("Add Q1"))
    expect(screen.getByTestId("queueLength")).toHaveTextContent("1")
  })

  it("removeFromQueue removes by ID", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    await user.click(screen.getByText("Add Q1"))
    await user.click(screen.getByText("Add Q2"))
    expect(screen.getByTestId("queueLength")).toHaveTextContent("2")

    await user.click(screen.getByText("Remove Q1"))
    expect(screen.getByTestId("queueLength")).toHaveTextContent("1")
    expect(screen.getByTestId("queueIds")).toHaveTextContent("q-2")
  })

  it("reorderQueue swaps positions", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    await user.click(screen.getByText("Add Q1"))
    await user.click(screen.getByText("Add Q2"))
    await user.click(screen.getByText("Add Q3"))
    expect(screen.getByTestId("queueIds")).toHaveTextContent("q-1,q-2,q-3")

    // Reorder: move index 0 to index 2
    await user.click(screen.getByText("Reorder 0→2"))
    expect(screen.getByTestId("queueIds")).toHaveTextContent("q-2,q-3,q-1")
  })

  it("clearQueue empties the queue", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    await user.click(screen.getByText("Add Q1"))
    await user.click(screen.getByText("Add Q2"))
    expect(screen.getByTestId("queueLength")).toHaveTextContent("2")

    await user.click(screen.getByText("Clear Queue"))
    expect(screen.getByTestId("queueLength")).toHaveTextContent("0")
  })

  it("playNext plays first item and shifts queue", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    await user.click(screen.getByText("Add Q1"))
    await user.click(screen.getByText("Add Q2"))
    expect(screen.getByTestId("queueIds")).toHaveTextContent("q-1,q-2")

    await user.click(screen.getByText("Play Next"))
    expect(screen.getByTestId("episodeTitle")).toHaveTextContent("Queue Episode 1")
    expect(screen.getByTestId("queueIds")).toHaveTextContent("q-2")
    expect(screen.getByTestId("queueLength")).toHaveTextContent("1")
  })

  it("playNext with empty queue does nothing", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    expect(screen.getByTestId("queueLength")).toHaveTextContent("0")

    await user.click(screen.getByText("Play Next"))
    // Should still be playing the original episode
    expect(screen.getByTestId("episodeTitle")).toHaveTextContent("Test Episode")
  })

  it("queue persists to localStorage on mutation", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    await user.click(screen.getByText("Add Q1"))

    // saveQueue should have been called (once for INIT_QUEUE, once for ADD_TO_QUEUE)
    expect(mockSaveQueue).toHaveBeenCalled()
    const lastCall = mockSaveQueue.mock.calls[mockSaveQueue.mock.calls.length - 1]
    expect(lastCall[0]).toHaveLength(1)
    expect(lastCall[0][0].id).toBe("q-1")
  })

  it("queue loads from localStorage on mount", () => {
    mockLoadQueue.mockReturnValue([queueEpisode1, queueEpisode2])
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    expect(mockLoadQueue).toHaveBeenCalled()
    expect(screen.getByTestId("queueLength")).toHaveTextContent("2")
    expect(screen.getByTestId("queueIds")).toHaveTextContent("q-1,q-2")
  })
})

describe("Auto-play next", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    playMock.mockResolvedValue(undefined)
    mockLoadPrefs.mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
    mockLoadQueue.mockReturnValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("calls playNext after ended event + 3s delay when queue has items", async () => {
    // Pre-load queue from localStorage so we don't need click interactions
    mockLoadQueue.mockReturnValue([queueEpisode1])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    expect(screen.getByTestId("queueLength")).toHaveTextContent("1")

    // Play an episode first
    await user.click(screen.getByText("Play Episode"))
    expect(screen.getByTestId("episodeTitle")).toHaveTextContent("Test Episode")

    // Fire ended event
    act(() => fireAudioEvent("ended"))

    // After 3 seconds, playNext should fire
    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    // q-1 should now be playing
    expect(screen.getByTestId("episodeTitle")).toHaveTextContent("Queue Episode 1")
    expect(screen.getByTestId("queueLength")).toHaveTextContent("0")
  })

  it("does not auto-play when queue is empty on ended", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    expect(screen.getByTestId("queueLength")).toHaveTextContent("0")

    act(() => fireAudioEvent("ended"))

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    // Should still show the original episode (stopped, not replaced)
    expect(screen.getByTestId("episodeTitle")).toHaveTextContent("Test Episode")
    expect(screen.getByTestId("isPlaying")).toHaveTextContent("false")
  })

  it("cancels auto-play when user plays a different episode during countdown", async () => {
    mockLoadQueue.mockReturnValue([queueEpisode1, queueEpisode2])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    expect(screen.getByTestId("queueLength")).toHaveTextContent("2")

    await user.click(screen.getByText("Play Episode"))

    // Fire ended event to start countdown
    act(() => fireAudioEvent("ended"))

    // Before 3s, play a different episode (simulated by clicking Play Episode again)
    await user.click(screen.getByText("Play Episode"))

    // Advance past the timeout
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    // Should be playing the manually selected episode, not q-1
    expect(screen.getByTestId("episodeTitle")).toHaveTextContent("Test Episode")
    // Queue should still have both items since playNext was cancelled
    expect(screen.getByTestId("queueLength")).toHaveTextContent("2")
  })
})

describe("Auto-play next error recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    playMock.mockResolvedValue(undefined)
    mockLoadPrefs.mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
    mockLoadQueue.mockReturnValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("resets player and removes failed episode when auto-advanced episode errors", async () => {
    mockLoadQueue.mockReturnValue([queueEpisode1])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    // Play an episode first so auto-advance has something to advance from
    await user.click(screen.getByText("Play Episode"))

    // Fire ended event to start 3s countdown
    act(() => fireAudioEvent("ended"))

    // playMock rejects on the next call (simulating the auto-advanced episode failing)
    playMock.mockRejectedValueOnce(new DOMException("NotSupportedError"))

    // Advance 3s so auto-play fires
    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    // Simulate the onerror event that the browser fires when audio fails
    const audio = getAudioElement()!
    Object.defineProperty(audio, "error", {
      value: { code: 4 }, // MEDIA_ERR_SRC_NOT_SUPPORTED
      configurable: true,
    })
    act(() => fireAudioEvent("error"))

    // Player should be closed (not visible, no episode)
    expect(screen.getByTestId("isVisible")).toHaveTextContent("false")
    expect(screen.getByTestId("episodeTitle")).toHaveTextContent("")
    // The failed episode (q-1) should be removed from queue
    expect(screen.getByTestId("queueLength")).toHaveTextContent("0")
  })
})

describe("closePlayer cancels auto-play timer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    playMock.mockResolvedValue(undefined)
    mockLoadPrefs.mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
    mockLoadQueue.mockReturnValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("cancels auto-play when closePlayer is called during countdown", async () => {
    mockLoadQueue.mockReturnValue([queueEpisode1])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    expect(screen.getByTestId("queueLength")).toHaveTextContent("1")

    // Fire ended to start countdown
    act(() => fireAudioEvent("ended"))

    // Close player during countdown
    await user.click(screen.getByText("Close"))
    expect(screen.getByTestId("isVisible")).toHaveTextContent("false")

    // Advance past the timeout
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    // Player should still be closed — auto-play did not fire
    expect(screen.getByTestId("isVisible")).toHaveTextContent("false")
    expect(screen.getByTestId("episodeTitle")).toHaveTextContent("")
  })
})

describe("reorderQueue edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playMock.mockResolvedValue(undefined)
    mockLoadPrefs.mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
    mockLoadQueue.mockReturnValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reorderQueue with out-of-bounds indices is a no-op", async () => {
    const user = userEvent.setup()
    // Render a consumer that exposes a button for an out-of-bounds reorder
    function OutOfBoundsConsumer() {
      const state = useAudioPlayerState()
      const api = useAudioPlayerAPI()
      return (
        <div>
          <span data-testid="queueIds">{state.queue.map((ep) => ep.id).join(",")}</span>
          <button onClick={() => api.playEpisode(mockEpisode)}>Play Episode</button>
          <button onClick={() => api.addToQueue(queueEpisode1)}>Add Q1</button>
          <button onClick={() => api.reorderQueue(0, 99)}>Reorder OOB</button>
        </div>
      )
    }
    render(
      <AudioPlayerProvider>
        <OutOfBoundsConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    await user.click(screen.getByText("Add Q1"))
    expect(screen.getByTestId("queueIds")).toHaveTextContent("q-1")

    await user.click(screen.getByText("Reorder OOB"))
    // Queue should be unchanged
    expect(screen.getByTestId("queueIds")).toHaveTextContent("q-1")
  })
})

describe("Media Session nexttrack handler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playMock.mockResolvedValue(undefined)
    mockLoadPrefs.mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
    mockLoadQueue.mockReturnValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("sets nexttrack handler on mount", async () => {
    const { setupMediaSessionHandlers } = await import("@/lib/media-session")
    const mockSetup = vi.mocked(setupMediaSessionHandlers)

    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    // Handler is always set (checks queue at call-time)
    const calls = mockSetup.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const lastCall = calls[calls.length - 1]
    expect(lastCall[0].onNextTrack).toBeTypeOf("function")
  })
})

describe("hooks throw outside provider", () => {
  // Suppress React error boundary console errors
  const originalError = console.error
  beforeEach(() => {
    console.error = vi.fn()
  })
  afterEach(() => {
    console.error = originalError
  })

  it("useAudioPlayerAPI throws without provider", () => {
    function BadConsumer() {
      useAudioPlayerAPI()
      return null
    }
    expect(() => render(<BadConsumer />)).toThrow(
      "useAudioPlayerAPI must be used within AudioPlayerProvider"
    )
  })

  it("useAudioPlayerState throws without provider", () => {
    function BadConsumer() {
      useAudioPlayerState()
      return null
    }
    expect(() => render(<BadConsumer />)).toThrow(
      "useAudioPlayerState must be used within AudioPlayerProvider"
    )
  })

  it("useAudioPlayerProgress throws without provider", () => {
    function BadConsumer() {
      useAudioPlayerProgress()
      return null
    }
    expect(() => render(<BadConsumer />)).toThrow(
      "useAudioPlayerProgress must be used within AudioPlayerProvider"
    )
  })
})

// ---------------------------------------------------------------------------
// Chapter state (T3)
// ---------------------------------------------------------------------------

function ChapterConsumer() {
  const state = useAudioPlayerState()
  const api = useAudioPlayerAPI()
  return (
    <div>
      <span data-testid="chapters">{state.chapters ? JSON.stringify(state.chapters) : "null"}</span>
      <span data-testid="chaptersLoading">{String(state.chaptersLoading)}</span>
      <span data-testid="episodeTitle">{state.currentEpisode?.title ?? ""}</span>
      <button onClick={() => api.playEpisode(mockEpisode)}>Play Episode</button>
      <button
        onClick={() =>
          api.playEpisode({
            ...mockEpisode,
            id: "ep-with-chapters",
            chaptersUrl: "https://example.com/chapters.json",
          })
        }
      >
        Play Episode With Chapters
      </button>
      <button onClick={api.closePlayer}>Close</button>
    </div>
  )
}

describe("Chapter state management", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playMock.mockResolvedValue(undefined)
    mockLoadPrefs.mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
    mockLoadQueue.mockReturnValue([])
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("initial chapter state is null and not loading", () => {
    render(
      <AudioPlayerProvider>
        <ChapterConsumer />
      </AudioPlayerProvider>
    )
    expect(screen.getByTestId("chapters")).toHaveTextContent("null")
    expect(screen.getByTestId("chaptersLoading")).toHaveTextContent("false")
  })

  it("chapters and chaptersLoading reset to null/false on PLAY_EPISODE", async () => {
    const user = userEvent.setup()
    // Mock fetch to never resolve — so chapters stay loading
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))

    render(
      <AudioPlayerProvider>
        <ChapterConsumer />
      </AudioPlayerProvider>
    )

    // Play episode with chapters first to trigger fetch
    await user.click(screen.getByText("Play Episode With Chapters"))
    expect(screen.getByTestId("chaptersLoading")).toHaveTextContent("true")

    // Now play a different episode without chaptersUrl
    await user.click(screen.getByText("Play Episode"))
    expect(screen.getByTestId("chapters")).toHaveTextContent("null")
    expect(screen.getByTestId("chaptersLoading")).toHaveTextContent("false")
  })

  it("does not trigger chapter fetch when episode has no chaptersUrl", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <ChapterConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByTestId("chaptersLoading")).toHaveTextContent("false")
    expect(screen.getByTestId("chapters")).toHaveTextContent("null")
  })

  it("sets chaptersLoading when episode has chaptersUrl", async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockReturnValue(new Promise(() => {})) // never resolves

    render(
      <AudioPlayerProvider>
        <ChapterConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode With Chapters"))
    expect(screen.getByTestId("chaptersLoading")).toHaveTextContent("true")
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/chapters?url="),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it("dispatches SET_CHAPTERS on successful chapter fetch", async () => {
    const user = userEvent.setup()
    const mockChapters = [
      { startTime: 0, title: "Intro" },
      { startTime: 60, title: "Main" },
    ]
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ chapters: mockChapters }),
    } as Response)

    render(
      <AudioPlayerProvider>
        <ChapterConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode With Chapters"))

    // Wait for async fetch to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(screen.getByTestId("chaptersLoading")).toHaveTextContent("false")
    expect(screen.getByTestId("chapters")).toHaveTextContent(JSON.stringify(mockChapters))
  })

  it("dispatches CLEAR_CHAPTERS on failed chapter fetch", async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"))

    render(
      <AudioPlayerProvider>
        <ChapterConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode With Chapters"))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(screen.getByTestId("chaptersLoading")).toHaveTextContent("false")
    expect(screen.getByTestId("chapters")).toHaveTextContent("null")
  })

  it("dispatches CLEAR_CHAPTERS when fetch returns non-ok status", async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
    } as Response)

    render(
      <AudioPlayerProvider>
        <ChapterConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode With Chapters"))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(screen.getByTestId("chaptersLoading")).toHaveTextContent("false")
    expect(screen.getByTestId("chapters")).toHaveTextContent("null")
  })

  it("closePlayer clears chapters state", async () => {
    const user = userEvent.setup()
    const mockChapters = [{ startTime: 0, title: "Intro" }]
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ chapters: mockChapters }),
    } as Response)

    render(
      <AudioPlayerProvider>
        <ChapterConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode With Chapters"))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(screen.getByTestId("chapters")).not.toHaveTextContent("null")

    await user.click(screen.getByText("Close"))
    expect(screen.getByTestId("chapters")).toHaveTextContent("null")
    expect(screen.getByTestId("chaptersLoading")).toHaveTextContent("false")
  })
})

// ---------------------------------------------------------------------------
// Cross-device sync: server action mocks (T8)
// ---------------------------------------------------------------------------

const mockGetQueue = vi.fn().mockResolvedValue({ success: true, data: [] })
const mockSetQueueAction = vi.fn().mockResolvedValue({ success: true })
const mockClearQueueAction = vi.fn().mockResolvedValue({ success: true })
vi.mock("@/app/actions/listening-queue", () => ({
  getQueue: (...args: unknown[]) => mockGetQueue(...args),
  setQueue: (...args: unknown[]) => mockSetQueueAction(...args),
  clearQueue: (...args: unknown[]) => mockClearQueueAction(...args),
}))

const mockGetPlayerSession = vi.fn().mockResolvedValue({ success: true, data: null })
const mockSavePlayerSessionAction = vi.fn().mockResolvedValue({ success: true })
const mockClearPlayerSessionAction = vi.fn().mockResolvedValue({ success: true })
vi.mock("@/app/actions/player-session", () => ({
  getPlayerSession: (...args: unknown[]) => mockGetPlayerSession(...args),
  savePlayerSession: (...args: unknown[]) => mockSavePlayerSessionAction(...args),
  clearPlayerSession: (...args: unknown[]) => mockClearPlayerSessionAction(...args),
}))

// ---------------------------------------------------------------------------
// Listen history recording (T3.1)
// ---------------------------------------------------------------------------

describe("Listen history recording", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playMock.mockResolvedValue(undefined)
    mockLoadPrefs.mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
    mockLoadQueue.mockReturnValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("does not call recordListenEvent when currentTime < 30s", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))

    const audio = getAudioElement()!
    Object.defineProperty(audio, "currentTime", { value: 10, configurable: true })
    act(() => fireAudioEvent("timeupdate"))

    expect(mockRecordListenEvent).not.toHaveBeenCalled()
  })

  it("calls recordListenEvent when currentTime crosses 30s", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))

    const audio = getAudioElement()!
    Object.defineProperty(audio, "currentTime", { value: 30, configurable: true })
    act(() => fireAudioEvent("timeupdate"))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(mockRecordListenEvent).toHaveBeenCalledTimes(1)
    expect(mockRecordListenEvent).toHaveBeenCalledWith(
      expect.objectContaining({ podcastIndexEpisodeId: mockEpisode.id })
    )
  })

  it("does not call recordListenEvent again for the same episode on subsequent timeupdate events", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))

    const audio = getAudioElement()!
    Object.defineProperty(audio, "currentTime", { value: 30, configurable: true })
    // Fire timeupdate multiple times past 30s
    act(() => fireAudioEvent("timeupdate"))
    act(() => fireAudioEvent("timeupdate"))
    act(() => fireAudioEvent("timeupdate"))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(mockRecordListenEvent).toHaveBeenCalledTimes(1)
  })

  it("calls recordListenEvent with completed:true on ended event", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))

    const audio = getAudioElement()!
    Object.defineProperty(audio, "duration", { value: 600, configurable: true })
    act(() => fireAudioEvent("ended"))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(mockRecordListenEvent).toHaveBeenCalledWith(
      expect.objectContaining({ completed: true, podcastIndexEpisodeId: mockEpisode.id })
    )
  })

  it("includes durationSeconds in the completed event", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))

    const audio = getAudioElement()!
    Object.defineProperty(audio, "duration", { value: 600, configurable: true })
    act(() => fireAudioEvent("ended"))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(mockRecordListenEvent).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 600, podcastIndexEpisodeId: mockEpisode.id })
    )
  })

  it("omits durationSeconds from completed event when audio.duration is Infinity", async () => {
    const user = userEvent.setup()
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))

    const audio = getAudioElement()!
    Object.defineProperty(audio, "duration", { value: Infinity, configurable: true })
    act(() => fireAudioEvent("ended"))

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(mockRecordListenEvent).toHaveBeenCalledWith(
      expect.objectContaining({ completed: true })
    )
    const callArgs = mockRecordListenEvent.mock.calls[0][0]
    expect(callArgs.durationSeconds).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Cross-device sync: hydration, reconcile, migration (T8)
// ---------------------------------------------------------------------------

describe("Cross-device sync: hydration and reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playMock.mockResolvedValue(undefined)
    mockLoadPrefs.mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
    mockLoadQueue.mockReturnValue([])
    mockLoadSession.mockReturnValue(null)
    mockGetQueue.mockResolvedValue({ success: true, data: [] })
    mockGetPlayerSession.mockResolvedValue({ success: true, data: null })
    mockSetQueueAction.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("calls getQueue and getPlayerSession on mount (after loadQueue/loadPlayerSession)", async () => {
    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockGetQueue).toHaveBeenCalled()
    expect(mockGetPlayerSession).toHaveBeenCalled()
    // Server calls must happen after (or concurrent with) local cache reads
    const loadQueueOrder = mockLoadQueue.mock.invocationCallOrder[0]
    const getQueueOrder = mockGetQueue.mock.invocationCallOrder[0]
    expect(loadQueueOrder).toBeLessThanOrEqual(getQueueOrder)
  })

  it("replaces queue with server state when server returns a non-empty queue different from local", async () => {
    const serverQueue: AudioEpisode[] = [
      { id: "server-1", title: "Server Ep 1", podcastTitle: "Podcast", audioUrl: "https://example.com/s1.mp3" },
    ]
    mockGetQueue.mockResolvedValue({ success: true, data: serverQueue })

    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })

    await waitFor(() => {
      expect(screen.getByTestId("queueIds")).toHaveTextContent("server-1")
    }, { timeout: 5000 })
  })

  it("calls setQueue(localQueue) exactly once when server is empty and local cache is non-empty (migration)", async () => {
    const localQueue: AudioEpisode[] = [
      { id: "local-1", title: "Local Ep", podcastTitle: "Podcast", audioUrl: "https://example.com/l1.mp3" },
    ]
    mockLoadQueue.mockReturnValue(localQueue)
    mockGetQueue.mockResolvedValue({ success: true, data: [] })

    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockSetQueueAction).toHaveBeenCalledTimes(1)
    expect(mockSetQueueAction).toHaveBeenCalledWith(localQueue)
  })

  it("does not overwrite currentTime on focus when active episode matches server session", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const serverSession = {
      episode: { ...mockEpisode },
      currentTime: 999, // stale server time
    }
    mockGetPlayerSession.mockResolvedValue({ success: true, data: serverSession })

    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    // Play the episode
    await user.click(screen.getByText("Play Episode"))
    const audio = getAudioElement()!
    audio.currentTime = 300 // actively playing at 300s

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Simulate focus event to trigger reconcile
    await act(async () => {
      window.dispatchEvent(new Event("focus"))
      await vi.runAllTimersAsync()
    })

    vi.useRealTimers()
    // Audio currentTime should NOT have been reset to 999 (server stale time)
    expect(audio.currentTime).toBe(300)
  })

  it("does not dispatch INIT_QUEUE with server state when a local queue mutation is pending (debounce timer active)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const serverQueue: AudioEpisode[] = [
      { id: "server-1", title: "Server Ep", podcastTitle: "Podcast", audioUrl: "https://example.com/s1.mp3" },
    ]
    mockGetQueue.mockResolvedValue({ success: true, data: serverQueue })

    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    // Play episode first so queue state is active
    await user.click(screen.getByText("Play Episode"))

    // Add to queue to trigger local mutation (debounce timer starts)
    await user.click(screen.getByText("Add Q1"))
    // Queue now has q-1 pending write; don't advance timers so debounce is still active

    // Fire focus event which should trigger getQueue
    await act(async () => {
      window.dispatchEvent(new Event("focus"))
      // Advance only the focus debounce (200ms), NOT the queue debounce (1500ms)
      vi.advanceTimersByTime(200)
      await Promise.resolve()
    })

    vi.useRealTimers()
    // Queue should still be q-1 (local mutation), NOT replaced by server-1
    expect(screen.getByTestId("queueIds")).toHaveTextContent("q-1")
  })

  it("migration race: in-flight setQueue suppresses concurrent focus INIT_QUEUE dispatch", async () => {
    const localQueue: AudioEpisode[] = [
      { id: "local-1", title: "Local Ep", podcastTitle: "Podcast", audioUrl: "https://example.com/l1.mp3" },
    ]
    mockLoadQueue.mockReturnValue(localQueue)

    // Server starts empty (triggers migration)
    let resolveMigration!: (value: { success: true }) => void
    const migrationPromise = new Promise<{ success: true }>((resolve) => {
      resolveMigration = resolve
    })
    mockGetQueue
      .mockResolvedValueOnce({ success: true, data: [] }) // mount: empty → triggers migration
      .mockResolvedValueOnce({ success: true, data: [] }) // focus: still empty (migration not done)
    mockSetQueueAction.mockReturnValueOnce(migrationPromise)

    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    // Wait for mount fetch to resolve (triggers migration, but migration upload is pending)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Simulate focus event while migration upload is still in-flight
    // The focus debounce is 200ms — wait for it to fire
    await act(async () => {
      window.dispatchEvent(new Event("focus"))
      await new Promise((r) => setTimeout(r, 300))
    })

    // Queue must still be the local snapshot (not wiped by server empty state)
    expect(screen.getByTestId("queueIds")).toHaveTextContent("local-1")

    // Resolve migration upload
    await act(async () => {
      resolveMigration({ success: true })
      await new Promise((r) => setTimeout(r, 50))
    })
  })

  it("dispatches INIT_QUEUE with lastAckedQueue and fires toast on setQueue server failure", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    // Start with server returning an initial queue (lastAcked = this)
    const initialServerQueue: AudioEpisode[] = [
      { id: "acked-1", title: "Acked Ep", podcastTitle: "Podcast", audioUrl: "https://example.com/a1.mp3" },
    ]
    mockGetQueue.mockResolvedValue({ success: true, data: initialServerQueue })
    // Subsequent setQueue calls fail
    mockSetQueueAction.mockResolvedValue({ success: false, error: "DB error" })

    const { toast } = await import("sonner")

    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    // Wait for mount reconcile (lastAckedQueue = initialServerQueue)
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Play episode first so we can add to queue
    await user.click(screen.getByText("Play Episode"))

    // Add an episode to trigger debounced setQueue
    await user.click(screen.getByText("Add Q1"))

    // Advance debounce timer to fire setQueue (which fails)
    await act(async () => {
      vi.advanceTimersByTime(1500)
      await vi.runAllTimersAsync()
    })

    vi.useRealTimers()

    // After failure, queue should be rolled back to lastAckedQueue
    await waitFor(() => {
      expect(screen.getByTestId("queueIds")).toHaveTextContent("acked-1")
    }, { timeout: 2000 })
    expect(toast.error).toHaveBeenCalled()
  })

  it("savePlayerSession server action is called on the 5s throttle tick", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <AudioPlayerProvider>
        <TestConsumer />
      </AudioPlayerProvider>
    )

    await user.click(screen.getByText("Play Episode"))

    // Need to set isSessionRestored first by advancing timers for the session restore
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const audio = getAudioElement()!
    audio.currentTime = 60

    // Fire timeupdate events to trigger the 5s throttle
    act(() => fireAudioEvent("timeupdate"))
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    act(() => fireAudioEvent("timeupdate"))

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    vi.useRealTimers()
    expect(mockSavePlayerSessionAction).toHaveBeenCalled()
  })
})
