import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { SeekBar } from "@/components/audio-player/seek-bar"

// Radix Slider uses ResizeObserver which jsdom doesn't provide
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

const mockState = {
  duration: 300,
  currentEpisode: null,
  isPlaying: false,
  isBuffering: false,
  isVisible: true,
  volume: 1,
  playbackSpeed: 1,
  hasError: false,
  errorMessage: null,
}

const mockProgress = {
  currentTime: 65,
  buffered: 150,
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

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: () => mockState,
  useAudioPlayerProgress: () => mockProgress,
  useAudioPlayerAPI: () => mockAPI,
}))

describe("SeekBar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProgress.currentTime = 65
    mockProgress.buffered = 150
    mockState.duration = 300
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("displays formatted current time", () => {
    render(<SeekBar />)
    // 65 seconds = 1:05
    expect(screen.getByText("1:05")).toBeInTheDocument()
  })

  it("displays formatted duration", () => {
    render(<SeekBar />)
    // 300 seconds = 5:00
    expect(screen.getByText("5:00")).toBeInTheDocument()
  })

  it("renders a slider", () => {
    render(<SeekBar />)
    expect(screen.getByRole("slider")).toBeInTheDocument()
  })

  it("shows 0:00 when currentTime is 0", () => {
    mockProgress.currentTime = 0
    render(<SeekBar />)
    expect(screen.getByText("0:00")).toBeInTheDocument()
  })

  it("renders buffered range indicator", () => {
    const { container } = render(<SeekBar />)
    // buffered = 150 / 300 = 50%
    const bufferedDiv = container.querySelector("[style]")
    expect(bufferedDiv).toBeTruthy()
    expect(bufferedDiv?.getAttribute("style")).toContain("50%")
  })
})
