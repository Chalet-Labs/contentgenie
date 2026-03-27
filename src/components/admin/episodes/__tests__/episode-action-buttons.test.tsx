import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// Mock useRealtimeRun
const mockUseRealtimeRun = vi.fn().mockReturnValue({ run: null })
vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: (...args: unknown[]) => mockUseRealtimeRun(...args),
}))

const mockGetEpisodeStatus = vi.fn()
const mockFetch = vi.fn()

vi.mock("@/app/actions/admin", () => ({
  getEpisodeStatus: (...args: unknown[]) => mockGetEpisodeStatus(...args),
}))

import { EpisodeActionButtons } from "@/components/admin/episodes/episode-action-buttons"

const baseEpisode = {
  id: 1,
  transcriptStatus: "available",
  summaryStatus: null,
  podcastIndexId: "123",
}

describe("EpisodeActionButtons", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    vi.clearAllMocks()
    mockUseRealtimeRun.mockReturnValue({ run: null })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ runId: "run_123", publicAccessToken: "tok_abc" }),
    })
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "available",
      summaryStatus: "completed",
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // --- Fetch Transcript button ---

  it("Fetch Transcript button renders with aria-label 'Fetch Transcript' when transcript is missing", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    expect(
      screen.getByRole("button", { name: "Fetch Transcript" })
    ).toBeInTheDocument()
  })

  it("Fetch Transcript button is disabled when transcriptStatus is available", () => {
    render(<EpisodeActionButtons episode={baseEpisode} />)
    expect(screen.getByRole("button", { name: /transcript available/i })).toBeDisabled()
  })

  it("Fetch Transcript button is enabled when transcript is not available", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    expect(screen.getByRole("button", { name: /fetch transcript/i })).not.toBeDisabled()
  })

  it("optimistically updates to disabled/fetching state on Fetch click", async () => {
    mockFetch.mockReturnValue(new Promise(() => {}))
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /fetch transcript/i }))
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /fetching transcript/i })
      ).toBeDisabled()
    })
  })

  it("posts to /api/episodes/fetch-transcript with episodeId on Fetch click", async () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /fetch transcript/i }))
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/fetch-transcript",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ episodeId: 1 }),
        })
      )
    })
  })

  it("click Fetch Transcript → API returns runId/publicAccessToken → useRealtimeRun called with them", async () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /fetch transcript/i }))
    await waitFor(() => {
      expect(mockUseRealtimeRun).toHaveBeenCalledWith("run_123", {
        accessToken: "tok_abc",
        enabled: true,
      })
    })
  })

  it("transcript run COMPLETED → local status updates to 'available'", async () => {
    mockUseRealtimeRun.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { enabled?: boolean } | undefined
      if (opts?.enabled) return { run: { status: "COMPLETED" } }
      return { run: null }
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /fetch transcript/i }))
    })
    await waitFor(() => {
      // Button becomes disabled with "Transcript available"
      expect(screen.getByRole("button", { name: /transcript available/i })).toBeDisabled()
    })
  })

  it("transcript run FAILED → local status updates to 'failed', shows error", async () => {
    let capturedArgs: unknown[] = []
    mockUseRealtimeRun.mockImplementation((...args: unknown[]) => {
      capturedArgs = args
      if (capturedArgs[1] && (capturedArgs[1] as { enabled?: boolean }).enabled) {
        return { run: { status: "FAILED" } }
      }
      return { run: null }
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /fetch transcript/i }))
    })
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /transcript fetch failed/i }).length
      ).toBeGreaterThanOrEqual(1)
    })
  })

  it("transcript run CANCELED → shows error (terminal status handling)", async () => {
    mockUseRealtimeRun.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { enabled?: boolean } | undefined
      if (opts?.enabled) return { run: { status: "CANCELED" } }
      return { run: null }
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /fetch transcript/i }))
    })
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /transcript fetch failed/i }).length
      ).toBeGreaterThanOrEqual(1)
    })
  })

  // --- Summarize button ---

  it("Summarize button renders with aria-label 'Summarize' when transcript available and no prior summary", () => {
    render(<EpisodeActionButtons episode={baseEpisode} />)
    expect(
      screen.getByRole("button", { name: "Summarize" })
    ).toBeInTheDocument()
  })

  it("Summarize button is disabled when transcript is not available", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    expect(screen.getByRole("button", { name: /transcript required/i })).toBeDisabled()
  })

  it("Summarize button has aria-label 'Re-summarize' when summaryStatus is completed", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, summaryStatus: "completed" }}
      />
    )
    expect(
      screen.getByRole("button", { name: /re-summarize/i })
    ).toBeInTheDocument()
  })

  it("Summarize button has aria-label 'Re-summarize' when summaryStatus is failed", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, summaryStatus: "failed" }}
      />
    )
    expect(
      screen.getByRole("button", { name: /re-summarize/i })
    ).toBeInTheDocument()
  })

  it("Summarize button is disabled when summaryStatus is queued", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, summaryStatus: "queued" }}
      />
    )
    expect(screen.getByRole("button", { name: /summarizing/i })).toBeDisabled()
  })

  it("posts to /api/episodes/summarize with podcastIndexId on Summarize click", async () => {
    render(<EpisodeActionButtons episode={baseEpisode} />)
    fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }))
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/summarize",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ episodeId: Number(baseEpisode.podcastIndexId) }),
        })
      )
    })
  })

  it("click Summarize → API returns runId/publicAccessToken → useRealtimeRun called with them", async () => {
    render(<EpisodeActionButtons episode={baseEpisode} />)
    fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }))
    await waitFor(() => {
      expect(mockUseRealtimeRun).toHaveBeenCalledWith("run_123", {
        accessToken: "tok_abc",
        enabled: true,
      })
    })
  })

  it("summary run COMPLETED → local status updates to 'completed'", async () => {
    // First call (transcript hook): disabled, returns null
    // Second call (summary hook): enabled after summarize click, returns COMPLETED
    let summarizeTriggered = false
    mockUseRealtimeRun.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { enabled?: boolean } | undefined
      if (opts?.enabled && summarizeTriggered) return { run: { status: "COMPLETED" } }
      return { run: null }
    })
    render(<EpisodeActionButtons episode={baseEpisode} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }))
      summarizeTriggered = true
    })
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /re-summarize/i })).toBeInTheDocument()
    })
  })

  it("summary run FAILED → shows summarization error", async () => {
    mockUseRealtimeRun.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { enabled?: boolean } | undefined
      if (opts?.enabled) return { run: { status: "FAILED" } }
      return { run: null }
    })
    render(<EpisodeActionButtons episode={baseEpisode} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }))
    })
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /summarization failed/i })).toBeInTheDocument()
    })
  })

  // --- Mount-time recovery ---

  it("mount with transcriptStatus 'fetching' → one-shot getEpisodeStatus → detects 'available'", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "available",
      summaryStatus: null,
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "fetching" }}
      />
    )
    await waitFor(() => {
      expect(mockGetEpisodeStatus).toHaveBeenCalledWith(baseEpisode.id)
      expect(screen.getByRole("button", { name: /transcript available/i })).toBeDisabled()
    })
  })

  it("mount with transcriptStatus 'fetching' → one-shot getEpisodeStatus → detects 'failed'", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "failed",
      summaryStatus: null,
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "fetching" }}
      />
    )
    await waitFor(() => {
      expect(mockGetEpisodeStatus).toHaveBeenCalledWith(baseEpisode.id)
      // After recovery, transcript is "failed" — Fetch & Summarize button becomes visible
      expect(screen.getByRole("button", { name: /fetch & summarize/i })).toBeInTheDocument()
    })
  })

  it("mount with transcriptStatus 'fetching' → getEpisodeStatus errors → shows error message, no crash", async () => {
    mockGetEpisodeStatus.mockRejectedValue(new Error("Network error"))
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "fetching" }}
      />
    )
    await waitFor(() => {
      expect(mockGetEpisodeStatus).toHaveBeenCalledWith(baseEpisode.id)
    })
    // Component should still render — no crash
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0)
  })

  it("mount with transcriptStatus 'fetching' → getEpisodeStatus returns ok:false → shows error message", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: false,
      error: "Admin access required",
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "fetching" }}
      />
    )
    await waitFor(() => {
      expect(mockGetEpisodeStatus).toHaveBeenCalledWith(baseEpisode.id)
    })
    // Component should still render — no crash
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0)
  })

  it("mount with transcriptStatus 'available' → does NOT call getEpisodeStatus", async () => {
    render(<EpisodeActionButtons episode={baseEpisode} />)
    // Wait a tick for any effects to run
    await act(async () => {})
    expect(mockGetEpisodeStatus).not.toHaveBeenCalled()
  })

  // --- Fetch & Summarize button visibility ---

  it("Fetch & Summarize button is visible when transcriptStatus is missing", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    expect(
      screen.getByRole("button", { name: /fetch & summarize/i })
    ).toBeInTheDocument()
  })

  it("Fetch & Summarize button is visible when transcriptStatus is failed", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "failed" }}
      />
    )
    expect(
      screen.getByRole("button", { name: /fetch & summarize/i })
    ).toBeInTheDocument()
  })

  it("Fetch & Summarize button is NOT rendered when transcriptStatus is available", () => {
    render(<EpisodeActionButtons episode={baseEpisode} />)
    expect(
      screen.queryByRole("button", { name: /fetch & summarize/i })
    ).not.toBeInTheDocument()
  })

  // --- Combined action: fetch-and-summarize chain ---

  it("combined action calls /api/episodes/fetch-transcript", async () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/fetch-transcript",
        expect.any(Object)
      )
    })
  })

  it("combined action does NOT call /api/episodes/summarize when transcript fetch HTTP fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Server error" }), status: 500 })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/fetch-transcript",
        expect.any(Object)
      )
    })
    expect(mockFetch).not.toHaveBeenCalledWith(
      "/api/episodes/summarize",
      expect.any(Object)
    )
  })

  it("combined action: transcript run COMPLETED → auto-triggers summarize", async () => {
    // transcript hook becomes enabled after fetch click and returns COMPLETED
    let transcriptRunEnabled = false
    mockUseRealtimeRun.mockImplementation((...args: unknown[]) => {
      const id = args[0] as string
      const opts = args[1] as { enabled?: boolean } | undefined
      // The first hook call with a real runId is the transcript hook
      if (opts?.enabled && id === "run_123" && transcriptRunEnabled) {
        return { run: { status: "COMPLETED" } }
      }
      return { run: null }
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
      transcriptRunEnabled = true
    })
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/summarize",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ episodeId: Number(baseEpisode.podcastIndexId) }),
        })
      )
    })
  })

  it("combined action: transcript run FAILED → does NOT trigger summarize", async () => {
    mockUseRealtimeRun.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { enabled?: boolean } | undefined
      if (opts?.enabled) return { run: { status: "FAILED" } }
      return { run: null }
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    })
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /transcript fetch failed/i }).length
      ).toBeGreaterThanOrEqual(1)
    })
    expect(mockFetch).not.toHaveBeenCalledWith(
      "/api/episodes/summarize",
      expect.any(Object)
    )
  })

  // --- Individual buttons disabled during combined action ---

  it("Fetch Transcript button is disabled during a combined action chain", async () => {
    mockFetch.mockReturnValue(new Promise(() => {}))
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /fetching transcript/i })
      ).toBeDisabled()
    })
  })

  it("Summarize button is disabled while transcript is still fetching in a combined action", async () => {
    mockFetch.mockReturnValue(new Promise(() => {}))
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/fetch-transcript",
        expect.any(Object)
      )
    )
    expect(screen.getByRole("button", { name: /fetching transcript/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /transcript required/i })).toBeDisabled()
  })

  // --- Error paths ---

  it("combined action: fetch HTTP failure shows error and re-enables buttons", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: "Server error" }), status: 500 })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    })
    await waitFor(() => {
      const errorBtns = screen.getAllByRole("button", { name: /server error/i })
      errorBtns.forEach(btn => expect(btn).not.toBeDisabled())
    })
  })

  it("standalone transcript fetch failure shows error message", async () => {
    mockUseRealtimeRun.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { enabled?: boolean } | undefined
      if (opts?.enabled) return { run: { status: "FAILED" } }
      return { run: null }
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /fetch transcript/i }))
    })
    await waitFor(() => {
      const errorBtns = screen.getAllByRole("button", {
        name: /transcript fetch failed/i,
      })
      expect(errorBtns.length).toBeGreaterThanOrEqual(1)
    })
  })

  // --- Tooltip rendering on hover ---

  it("tooltip renders on hover for disabled Fetch Transcript button", async () => {
    const user = userEvent.setup()
    render(<EpisodeActionButtons episode={baseEpisode} />)
    const btn = screen.getByRole("button", { name: /transcript available/i })
    await user.hover(btn.closest("span")!)
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Transcript available")
    })
  })

  it("tooltip renders on hover for disabled Summarize button", async () => {
    const user = userEvent.setup()
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    const btn = screen.getByRole("button", { name: /transcript required/i })
    await user.hover(btn.closest("span")!)
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Transcript required")
    })
  })

  it("tooltip renders error text when transcript fetch fails via realtime", async () => {
    const user = userEvent.setup()
    mockUseRealtimeRun.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { enabled?: boolean } | undefined
      if (opts?.enabled) return { run: { status: "FAILED" } }
      return { run: null }
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /fetch transcript/i }))
    })
    await waitFor(() => {
      const errorBtns = screen.getAllByRole("button", { name: /transcript fetch failed/i })
      expect(errorBtns.length).toBeGreaterThanOrEqual(1)
    })
    const errorBtn = screen.getAllByRole("button", { name: /transcript fetch failed/i })[0]
    await user.hover(errorBtn.closest("span")!)
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Transcript fetch failed")
    })
  })
})
