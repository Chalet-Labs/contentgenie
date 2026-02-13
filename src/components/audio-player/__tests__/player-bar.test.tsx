import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PlayerBar } from "@/components/audio-player/player-bar"

// Radix Slider uses ResizeObserver which jsdom doesn't provide
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// --- Mock the context hooks ---
const mockState = {
  currentEpisode: null as {
    id: string
    title: string
    podcastTitle: string
    audioUrl: string
    artwork?: string
    duration?: number
  } | null,
  isPlaying: false,
  isBuffering: false,
  isVisible: false,
  duration: 300,
  volume: 1,
  playbackSpeed: 1,
  hasError: false,
  errorMessage: null as string | null,
}

const mockAPI = {
  playEpisode: vi.fn(),
  togglePlay: vi.fn(),
  seek: vi.fn(),
  skipForward: vi.fn(),
  skipBack: vi.fn(),
  setVolume: vi.fn(),
  setPlaybackSpeed: vi.fn(),
  closePlayer: vi.fn(),
}

const mockProgress = {
  currentTime: 45,
  buffered: 120,
}

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: () => mockState,
  useAudioPlayerAPI: () => mockAPI,
  useAudioPlayerProgress: () => mockProgress,
}))

const testEpisode = {
  id: "ep-1",
  title: "A Test Episode Title",
  podcastTitle: "My Podcast",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://example.com/art.jpg",
  duration: 300,
}

describe("PlayerBar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(mockState, {
      currentEpisode: null,
      isPlaying: false,
      isBuffering: false,
      isVisible: false,
      duration: 300,
      volume: 1,
      playbackSpeed: 1,
      hasError: false,
      errorMessage: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders nothing when not visible", () => {
    const { container } = render(<PlayerBar />)
    expect(container.innerHTML).toBe("")
  })

  it("renders nothing when no episode loaded", () => {
    mockState.isVisible = true
    const { container } = render(<PlayerBar />)
    expect(container.innerHTML).toBe("")
  })

  it("renders player bar when visible with episode", () => {
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    render(<PlayerBar />)

    expect(screen.getByRole("region", { name: "Audio player" })).toBeInTheDocument()
    expect(screen.getAllByText(testEpisode.title).length).toBeGreaterThan(0)
    expect(screen.getAllByText(testEpisode.podcastTitle).length).toBeGreaterThan(0)
  })

  it("shows play button when paused", () => {
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    mockState.isPlaying = false
    render(<PlayerBar />)

    const playButtons = screen.getAllByRole("button", { name: "Play" })
    expect(playButtons.length).toBeGreaterThan(0)
  })

  it("shows pause button when playing", () => {
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    mockState.isPlaying = true
    render(<PlayerBar />)

    const pauseButtons = screen.getAllByRole("button", { name: "Pause" })
    expect(pauseButtons.length).toBeGreaterThan(0)
  })

  it("calls togglePlay when play/pause is clicked", async () => {
    const user = userEvent.setup()
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    render(<PlayerBar />)

    const playButtons = screen.getAllByRole("button", { name: "Play" })
    await user.click(playButtons[0])
    expect(mockAPI.togglePlay).toHaveBeenCalled()
  })

  it("calls skipBack when skip back is clicked", async () => {
    const user = userEvent.setup()
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    render(<PlayerBar />)

    const skipBackButtons = screen.getAllByRole("button", { name: "Skip back 15 seconds" })
    await user.click(skipBackButtons[0])
    expect(mockAPI.skipBack).toHaveBeenCalled()
  })

  it("calls skipForward when skip forward is clicked", async () => {
    const user = userEvent.setup()
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    render(<PlayerBar />)

    const skipForwardButtons = screen.getAllByRole("button", { name: "Skip forward 15 seconds" })
    await user.click(skipForwardButtons[0])
    expect(mockAPI.skipForward).toHaveBeenCalled()
  })

  it("calls closePlayer when close is clicked", async () => {
    const user = userEvent.setup()
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    render(<PlayerBar />)

    const closeButtons = screen.getAllByRole("button", { name: "Close player" })
    await user.click(closeButtons[0])
    expect(mockAPI.closePlayer).toHaveBeenCalled()
  })

  it("has aria-label on the player region", () => {
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    render(<PlayerBar />)

    expect(screen.getByRole("region")).toHaveAttribute("aria-label", "Audio player")
  })

  it("shows title attribute for long episode titles", () => {
    mockState.isVisible = true
    mockState.currentEpisode = {
      ...testEpisode,
      title: "A Very Long Episode Title That Should Be Truncated In The UI",
    }
    render(<PlayerBar />)

    const titleElements = screen.getAllByTitle(
      "A Very Long Episode Title That Should Be Truncated In The UI"
    )
    expect(titleElements.length).toBeGreaterThan(0)
  })
})
