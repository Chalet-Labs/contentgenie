import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PlayerBar, SKIP_FLASH_DURATION_MS } from "@/components/audio-player/player-bar"

// Radix Slider uses ResizeObserver which jsdom doesn't provide
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// jsdom doesn't provide matchMedia — stub it for the useMediaQuery hook
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

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
  queue: [] as { id: string; title: string; podcastTitle: string; audioUrl: string; artwork?: string; duration?: number }[],
  chapters: null as { startTime: number; title: string; img?: string; url?: string }[] | null,
  chaptersLoading: false,
  sleepTimer: null as {
    endTime: number | null
    type: "duration" | "end-of-episode"
  } | null,
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

const mockProgress = {
  currentTime: 45,
  buffered: 120,
}

vi.mock("@/contexts/audio-player-context", () => ({
  useAudioPlayerState: () => mockState,
  useAudioPlayerAPI: () => mockAPI,
  useAudioPlayerProgress: () => mockProgress,
  SKIP_BACK_SECONDS: 10,
  SKIP_FORWARD_SECONDS: 30,
}))

const mockChapterResult: {
  chapter: { startTime: number; title: string } | null
  index: number
} = { chapter: null, index: -1 }

vi.mock("@/hooks/use-current-chapter", () => ({
  useCurrentChapter: () => mockChapterResult,
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
      queue: [],
      chapters: null,
      chaptersLoading: false,
      sleepTimer: null,
    })
    Object.assign(mockProgress, { currentTime: 45, buffered: 120 })
    Object.assign(mockChapterResult, { chapter: null, index: -1 })
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

    const skipBackButtons = screen.getAllByRole("button", { name: "Skip back 10 seconds" })
    await user.click(skipBackButtons[0])
    expect(mockAPI.skipBack).toHaveBeenCalled()
  })

  it("calls skipForward when skip forward is clicked", async () => {
    const user = userEvent.setup()
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    render(<PlayerBar />)

    const skipForwardButtons = screen.getAllByRole("button", { name: "Skip forward 30 seconds" })
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

  it("renders episode links correctly in both desktop and mobile layouts", () => {
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    render(<PlayerBar />)

    const links = screen.getAllByRole("link", {
      name: `View episode: ${testEpisode.title} - ${testEpisode.podcastTitle}`,
    })

    expect(links).toHaveLength(2)
    links.forEach((link) => {
      expect(link).toHaveAttribute("href", `/episode/${testEpisode.id}`)
      expect(link).toHaveAttribute(
        "aria-label",
        `View episode: ${testEpisode.title} - ${testEpisode.podcastTitle}`
      )
    })
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

  it("hides chapters button when no chapters", () => {
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    mockState.chapters = null
    render(<PlayerBar />)

    expect(screen.queryByRole("button", { name: "Chapters" })).not.toBeInTheDocument()
  })

  it("shows sleep timer button when player is visible", () => {
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    render(<PlayerBar />)

    const sleepTimerButtons = screen.getAllByRole("button", { name: "Sleep timer" })
    expect(sleepTimerButtons.length).toBeGreaterThan(0)
  })

  it("shows chapters button when chapters are available", () => {
    mockState.isVisible = true
    mockState.currentEpisode = testEpisode
    mockState.chapters = [
      { startTime: 0, title: "Intro" },
      { startTime: 60, title: "Main" },
    ]
    render(<PlayerBar />)

    const chaptersButtons = screen.getAllByRole("button", { name: "Chapters" })
    expect(chaptersButtons.length).toBeGreaterThan(0)
  })

  describe("Previous chapter (iPod-style restart threshold)", () => {
    const chapters = [
      { startTime: 0, title: "Intro" },
      { startTime: 60, title: "Main" },
      { startTime: 180, title: "Outro" },
    ]

    it("jumps to the previous chapter when pressed < 3s into current chapter", async () => {
      const user = userEvent.setup()
      mockState.isVisible = true
      mockState.currentEpisode = testEpisode
      mockState.chapters = chapters
      mockProgress.currentTime = 61
      Object.assign(mockChapterResult, { chapter: chapters[1], index: 1 })
      render(<PlayerBar />)

      const prev = screen.getByRole("button", { name: "Previous chapter" })
      await user.click(prev)
      expect(mockAPI.seek).toHaveBeenCalledWith(0)
    })

    it("restarts the current chapter when pressed ≥ 3s in", async () => {
      const user = userEvent.setup()
      mockState.isVisible = true
      mockState.currentEpisode = testEpisode
      mockState.chapters = chapters
      mockProgress.currentTime = 75
      Object.assign(mockChapterResult, { chapter: chapters[1], index: 1 })
      render(<PlayerBar />)

      const prev = screen.getByRole("button", { name: "Previous chapter" })
      await user.click(prev)
      expect(mockAPI.seek).toHaveBeenCalledWith(60)
    })

    it("restarts the first chapter when ≥ 3s in with no earlier chapter", async () => {
      const user = userEvent.setup()
      mockState.isVisible = true
      mockState.currentEpisode = testEpisode
      mockState.chapters = chapters
      mockProgress.currentTime = 30
      Object.assign(mockChapterResult, { chapter: chapters[0], index: 0 })
      render(<PlayerBar />)

      const prev = screen.getByRole("button", { name: "Previous chapter" })
      await user.click(prev)
      expect(mockAPI.seek).toHaveBeenCalledWith(0)
    })
  })

  describe("Next chapter / next episode", () => {
    const chapters = [
      { startTime: 0, title: "Intro" },
      { startTime: 60, title: "Main" },
      { startTime: 180, title: "Outro" },
    ]

    it("advances to the next chapter when one exists", async () => {
      const user = userEvent.setup()
      mockState.isVisible = true
      mockState.currentEpisode = testEpisode
      mockState.chapters = chapters
      mockProgress.currentTime = 61
      Object.assign(mockChapterResult, { chapter: chapters[1], index: 1 })
      render(<PlayerBar />)

      const next = screen.getByRole("button", { name: "Next chapter" })
      await user.click(next)
      expect(mockAPI.seek).toHaveBeenCalledWith(180)
      expect(mockAPI.playNext).not.toHaveBeenCalled()
    })

    it("falls through to playNext() on the last chapter when the queue has items", async () => {
      const user = userEvent.setup()
      mockState.isVisible = true
      mockState.currentEpisode = testEpisode
      mockState.chapters = chapters
      mockState.queue = [
        { id: "ep-2", title: "Next ep", podcastTitle: "P", audioUrl: "a" },
      ]
      mockProgress.currentTime = 200
      Object.assign(mockChapterResult, { chapter: chapters[2], index: 2 })
      render(<PlayerBar />)

      const next = screen.getByRole("button", { name: "Next episode" })
      await user.click(next)
      expect(mockAPI.playNext).toHaveBeenCalled()
      expect(mockAPI.seek).not.toHaveBeenCalled()
    })

    it("advances chapter-by-chapter on rapid Next presses even before currentTime refreshes", async () => {
      const fourChapters = [
        { startTime: 0, title: "Intro" },
        { startTime: 60, title: "Main" },
        { startTime: 180, title: "Outro" },
        { startTime: 300, title: "Credits" },
      ]
      const user = userEvent.setup()
      mockState.isVisible = true
      mockState.currentEpisode = testEpisode
      mockState.chapters = fourChapters
      mockProgress.currentTime = 1
      Object.assign(mockChapterResult, { chapter: fourChapters[0], index: 0 })
      render(<PlayerBar />)

      const next = screen.getByRole("button", { name: "Next chapter" })
      await user.click(next)
      await user.click(next)
      await user.click(next)

      expect(mockAPI.seek).toHaveBeenNthCalledWith(1, fourChapters[1].startTime)
      expect(mockAPI.seek).toHaveBeenNthCalledWith(2, fourChapters[2].startTime)
      expect(mockAPI.seek).toHaveBeenNthCalledWith(3, fourChapters[3].startTime)
    })

    it("clears the optimistic target when Prev is pressed between Next presses", async () => {
      const fourChapters = [
        { startTime: 0, title: "Intro" },
        { startTime: 60, title: "Main" },
        { startTime: 180, title: "Outro" },
        { startTime: 300, title: "Credits" },
      ]
      const user = userEvent.setup()
      mockState.isVisible = true
      mockState.currentEpisode = testEpisode
      mockState.chapters = fourChapters
      mockProgress.currentTime = 1
      Object.assign(mockChapterResult, { chapter: fourChapters[0], index: 0 })
      render(<PlayerBar />)

      const next = screen.getByRole("button", { name: "Next chapter" })
      const prev = screen.getByRole("button", { name: "Previous chapter" })

      await user.click(next)
      expect(mockAPI.seek).toHaveBeenLastCalledWith(60)
      await user.click(prev)
      // Prev with elapsed < 3 and idx == 0 restarts chapter 0 (idx can't go lower).
      await user.click(next)
      // Without the reset, the 3rd seek would target chapter 2 (startTime=180)
      // because the optimistic ref was still at index 1.
      expect(mockAPI.seek).toHaveBeenLastCalledWith(60)
    })

    it("does not advance the queue while chapters are still loading", async () => {
      const user = userEvent.setup()
      mockState.isVisible = true
      mockState.currentEpisode = testEpisode
      mockState.chapters = null
      mockState.chaptersLoading = true
      mockState.queue = [
        { id: "ep-2", title: "Next ep", podcastTitle: "P", audioUrl: "a" },
      ]
      render(<PlayerBar />)

      const next = screen.getByRole("button", { name: "Next" })
      expect(next).toBeDisabled()
      await user.click(next)
      expect(mockAPI.playNext).not.toHaveBeenCalled()
    })

    it("renders a disabled 'Next' button when no chapter advance and empty queue", () => {
      mockState.isVisible = true
      mockState.currentEpisode = testEpisode
      mockState.chapters = chapters
      mockState.queue = []
      mockProgress.currentTime = 200
      Object.assign(mockChapterResult, { chapter: chapters[2], index: 2 })
      render(<PlayerBar />)

      const nextBtn = screen.getByRole("button", { name: "Next" })
      expect(nextBtn).toBeDisabled()
    })
  })

  describe("Skip flash lifecycle", () => {
    it("shows the flash on skip forward and clears it after the full window", () => {
      vi.useFakeTimers()
      try {
        mockState.isVisible = true
        mockState.currentEpisode = testEpisode
        render(<PlayerBar />)

        fireEvent.click(screen.getAllByRole("button", { name: "Skip forward 30 seconds" })[0])
        expect(screen.getByText(/\+ 30s/)).toBeInTheDocument()

        act(() => {
          vi.advanceTimersByTime(SKIP_FLASH_DURATION_MS)
        })
        expect(screen.queryByText(/\+ 30s/)).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it("resets the timer when skip fires again within the flash window", () => {
      vi.useFakeTimers()
      try {
        mockState.isVisible = true
        mockState.currentEpisode = testEpisode
        render(<PlayerBar />)

        const firstHalf = Math.floor(SKIP_FLASH_DURATION_MS * 0.57)
        const secondAdvance = Math.floor(SKIP_FLASH_DURATION_MS * 0.71)
        const remainder = SKIP_FLASH_DURATION_MS - secondAdvance + 1

        fireEvent.click(screen.getAllByRole("button", { name: "Skip back 10 seconds" })[0])
        expect(screen.getByText(/− 10s/)).toBeInTheDocument()

        act(() => {
          vi.advanceTimersByTime(firstHalf)
        })
        fireEvent.click(screen.getAllByRole("button", { name: "Skip forward 30 seconds" })[0])
        expect(screen.getByText(/\+ 30s/)).toBeInTheDocument()

        act(() => {
          vi.advanceTimersByTime(secondAdvance)
        })
        expect(screen.getByText(/\+ 30s/)).toBeInTheDocument()

        act(() => {
          vi.advanceTimersByTime(remainder)
        })
        expect(screen.queryByText(/\+ 30s/)).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it("clears pending flash when the player becomes invisible", () => {
      vi.useFakeTimers()
      try {
        mockState.isVisible = true
        mockState.currentEpisode = testEpisode
        const { rerender } = render(<PlayerBar />)

        fireEvent.click(screen.getAllByRole("button", { name: "Skip forward 30 seconds" })[0])
        expect(screen.getByText(/\+ 30s/)).toBeInTheDocument()

        mockState.isVisible = false
        rerender(<PlayerBar />)
        expect(screen.queryByText(/\+ 30s/)).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
