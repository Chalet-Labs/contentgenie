import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { VolumeControl } from "@/components/audio-player/volume-control"

// Radix Slider uses ResizeObserver which jsdom doesn't provide
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

const mockState = {
  volume: 0.8,
  currentEpisode: null,
  isPlaying: false,
  isBuffering: false,
  isVisible: true,
  duration: 0,
  playbackSpeed: 1,
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

describe("VolumeControl", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.volume = 0.8
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders mute button with Mute aria-label when not muted", () => {
    render(<VolumeControl />)
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument()
  })

  it("renders unmute button with Unmute aria-label when muted", () => {
    mockState.volume = 0
    render(<VolumeControl />)
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument()
  })

  it("mutes on click (sets volume to 0)", async () => {
    const user = userEvent.setup()
    render(<VolumeControl />)

    await user.click(screen.getByRole("button", { name: "Mute" }))
    expect(mockAPI.setVolume).toHaveBeenCalledWith(0)
  })

  it("unmutes on click (restores previous volume)", async () => {
    // First mute, then unmute
    mockState.volume = 0
    const user = userEvent.setup()
    render(<VolumeControl />)

    await user.click(screen.getByRole("button", { name: "Unmute" }))
    // Should restore to 1 (default previousVolume)
    expect(mockAPI.setVolume).toHaveBeenCalledWith(1)
  })

  it("renders a volume slider", () => {
    render(<VolumeControl />)
    expect(screen.getByRole("slider")).toBeInTheDocument()
  })

  it("has hidden md:flex class for desktop-only visibility", () => {
    const { container } = render(<VolumeControl />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain("hidden")
    expect(wrapper.className).toContain("md:flex")
  })
})
