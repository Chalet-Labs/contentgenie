import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PlaybackSpeed } from "@/components/audio-player/playback-speed"

const mockState = {
  playbackSpeed: 1,
  currentEpisode: null,
  isPlaying: false,
  isBuffering: false,
  isVisible: true,
  duration: 0,
  volume: 1,
  hasError: false,
  errorMessage: null,
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
  useAudioPlayerAPI: () => mockAPI,
}))

describe("PlaybackSpeed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.playbackSpeed = 1
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("displays current speed", () => {
    render(<PlaybackSpeed />)
    expect(screen.getByText("1x")).toBeInTheDocument()
  })

  it("displays 1.5x when speed is 1.5", () => {
    mockState.playbackSpeed = 1.5
    render(<PlaybackSpeed />)
    expect(screen.getByText("1.5x")).toBeInTheDocument()
  })

  it("cycles from 1x to 1.25x on click", async () => {
    const user = userEvent.setup()
    render(<PlaybackSpeed />)

    await user.click(screen.getByRole("button"))
    expect(mockAPI.setPlaybackSpeed).toHaveBeenCalledWith(1.25)
  })

  it("cycles from 1.25x to 1.5x on click", async () => {
    mockState.playbackSpeed = 1.25
    const user = userEvent.setup()
    render(<PlaybackSpeed />)

    await user.click(screen.getByRole("button"))
    expect(mockAPI.setPlaybackSpeed).toHaveBeenCalledWith(1.5)
  })

  it("cycles from 1.5x to 2x on click", async () => {
    mockState.playbackSpeed = 1.5
    const user = userEvent.setup()
    render(<PlaybackSpeed />)

    await user.click(screen.getByRole("button"))
    expect(mockAPI.setPlaybackSpeed).toHaveBeenCalledWith(2)
  })

  it("cycles from 2x back to 1x on click", async () => {
    mockState.playbackSpeed = 2
    const user = userEvent.setup()
    render(<PlaybackSpeed />)

    await user.click(screen.getByRole("button"))
    expect(mockAPI.setPlaybackSpeed).toHaveBeenCalledWith(1)
  })

  it("has descriptive aria-label", () => {
    render(<PlaybackSpeed />)
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Playback speed 1x, click to change"
    )
  })
})
