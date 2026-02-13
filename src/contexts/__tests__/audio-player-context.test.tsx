import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
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

// Mock player-preferences helpers
const mockLoadPrefs = vi.fn().mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
const mockSavePrefs = vi.fn()
vi.mock("@/lib/player-preferences", () => ({
  loadPlayerPreferences: (...args: unknown[]) => mockLoadPrefs(...args),
  savePlayerPreferences: (...args: unknown[]) => mockSavePrefs(...args),
}))

// --- Mock HTMLMediaElement prototype ---
// jsdom doesn't implement play/load/pause, so we stub them globally
const playMock = vi.fn().mockResolvedValue(undefined)
const pauseMock = vi.fn()
const loadMock = vi.fn()

// Track event listeners on audio elements
const audioListeners: Record<string, EventListener[]> = {}

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
      <button onClick={() => api.playEpisode(mockEpisode)}>Play Episode</button>
      <button onClick={api.togglePlay}>Toggle Play</button>
      <button onClick={() => api.seek(120)}>Seek 120</button>
      <button onClick={() => api.skipForward()}>Skip Forward</button>
      <button onClick={() => api.skipBack()}>Skip Back</button>
      <button onClick={() => api.setVolume(0.5)}>Set Volume</button>
      <button onClick={() => api.setPlaybackSpeed(2)}>Set Speed</button>
      <button onClick={api.closePlayer}>Close</button>
    </div>
  )
}

describe("AudioPlayerProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playMock.mockResolvedValue(undefined)
    mockLoadPrefs.mockReturnValue({ volume: 0.8, playbackSpeed: 1.5 })
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
