import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SleepTimerMenu } from "@/components/audio-player/sleep-timer-menu"

const mockState = {
  sleepTimer: null as {
    endTime: number | null
    type: "duration" | "end-of-episode"
    remainingSeconds: number
  } | null,
  currentEpisode: null,
  isPlaying: false,
  isBuffering: false,
  isVisible: true,
  duration: 0,
  volume: 1,
  playbackSpeed: 1,
  hasError: false,
  errorMessage: null,
  queue: [],
  chapters: null,
  chaptersLoading: false,
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
  addToQueue: vi.fn(),
  removeFromQueue: vi.fn(),
  reorderQueue: vi.fn(),
  clearQueue: vi.fn(),
  playNext: vi.fn(),
  setSleepTimer: vi.fn(),
  cancelSleepTimer: vi.fn(),
}

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: () => mockState,
  useAudioPlayerAPI: () => mockAPI,
}))

describe("SleepTimerMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.sleepTimer = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders the trigger button with Moon icon", () => {
    render(<SleepTimerMenu />)
    expect(screen.getByRole("button", { name: "Sleep timer" })).toBeInTheDocument()
  })

  it("shows menu items on click", async () => {
    const user = userEvent.setup()
    render(<SleepTimerMenu />)

    await user.click(screen.getByRole("button", { name: "Sleep timer" }))

    expect(screen.getByText("15 minutes")).toBeInTheDocument()
    expect(screen.getByText("30 minutes")).toBeInTheDocument()
    expect(screen.getByText("45 minutes")).toBeInTheDocument()
    expect(screen.getByText("60 minutes")).toBeInTheDocument()
    expect(screen.getByText("End of episode")).toBeInTheDocument()
  })

  it("does not show cancel option when no timer is active", async () => {
    const user = userEvent.setup()
    render(<SleepTimerMenu />)

    await user.click(screen.getByRole("button", { name: "Sleep timer" }))

    expect(screen.queryByText("Cancel timer")).not.toBeInTheDocument()
  })

  it.each([15, 30, 45, 60])(
    "calls setSleepTimer with %d when that preset is clicked",
    async (minutes) => {
      const user = userEvent.setup()
      render(<SleepTimerMenu />)

      await user.click(screen.getByRole("button", { name: "Sleep timer" }))
      await user.click(screen.getByText(`${minutes} minutes`))

      expect(mockAPI.setSleepTimer).toHaveBeenCalledWith(minutes)
    }
  )

  it("calls setSleepTimer with 'end-of-episode' for end of episode option", async () => {
    const user = userEvent.setup()
    render(<SleepTimerMenu />)

    await user.click(screen.getByRole("button", { name: "Sleep timer" }))
    await user.click(screen.getByText("End of episode"))

    expect(mockAPI.setSleepTimer).toHaveBeenCalledWith("end-of-episode")
  })

  it("shows cancel option when timer is active", async () => {
    mockState.sleepTimer = {
      endTime: Date.now() + 1800_000,
      type: "duration",
      remainingSeconds: 1800,
    }
    const user = userEvent.setup()
    render(<SleepTimerMenu />)

    await user.click(
      screen.getByRole("button", { name: /Sleep timer/ })
    )

    expect(screen.getByText("Cancel timer")).toBeInTheDocument()
  })

  it("calls cancelSleepTimer when cancel is clicked", async () => {
    mockState.sleepTimer = {
      endTime: Date.now() + 900_000,
      type: "duration",
      remainingSeconds: 900,
    }
    const user = userEvent.setup()
    render(<SleepTimerMenu />)

    await user.click(
      screen.getByRole("button", { name: /Sleep timer/ })
    )
    await user.click(screen.getByText("Cancel timer"))

    expect(mockAPI.cancelSleepTimer).toHaveBeenCalledOnce()
  })

  it("shows countdown text on trigger when duration timer is active", () => {
    mockState.sleepTimer = {
      endTime: Date.now() + 1500_000,
      type: "duration",
      remainingSeconds: 1500,
    }
    render(<SleepTimerMenu />)

    // formatTime(1500) = "25:00"
    expect(screen.getByText("25:00")).toBeInTheDocument()
  })

  it("shows 'End' text on trigger when end-of-episode timer is active", () => {
    mockState.sleepTimer = {
      endTime: null,
      type: "end-of-episode",
      remainingSeconds: 0,
    }
    render(<SleepTimerMenu />)

    expect(screen.getByText("End")).toBeInTheDocument()
  })

  it("has correct aria-label when duration timer is active", () => {
    mockState.sleepTimer = {
      endTime: Date.now() + 1800_000,
      type: "duration",
      remainingSeconds: 1800,
    }
    render(<SleepTimerMenu />)

    expect(
      screen.getByRole("button", {
        name: "Sleep timer — 30 minutes remaining",
      })
    ).toBeInTheDocument()
  })

  it("has correct aria-label when end-of-episode timer is active", () => {
    mockState.sleepTimer = {
      endTime: null,
      type: "end-of-episode",
      remainingSeconds: 0,
    }
    render(<SleepTimerMenu />)

    expect(
      screen.getByRole("button", {
        name: "Sleep timer — end of episode",
      })
    ).toBeInTheDocument()
  })

  it("shows check icon next to End of episode when end-of-episode timer is active", async () => {
    mockState.sleepTimer = {
      endTime: null,
      type: "end-of-episode",
      remainingSeconds: 0,
    }
    const user = userEvent.setup()
    render(<SleepTimerMenu />)

    await user.click(
      screen.getByRole("button", { name: /Sleep timer/ })
    )

    // The check icon renders as an svg inside the end-of-episode menu item
    const menuItem = screen.getByText("End of episode").closest("[role=menuitem]")
    expect(menuItem).not.toBeNull()
    expect(menuItem!.querySelector("svg")).toBeInTheDocument()
  })

  it("does not show check icon next to duration presets when duration timer is active", async () => {
    mockState.sleepTimer = {
      endTime: Date.now() + 1800_000,
      type: "duration",
      remainingSeconds: 1800,
    }
    const user = userEvent.setup()
    render(<SleepTimerMenu />)

    await user.click(
      screen.getByRole("button", { name: /Sleep timer/ })
    )

    const thirtyMinItem = screen.getByText("30 minutes").closest("[role=menuitem]")
    expect(thirtyMinItem).not.toBeNull()
    expect(thirtyMinItem!.querySelector("svg")).not.toBeInTheDocument()
  })
})
