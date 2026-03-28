import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockUseRealtimeRun = vi.fn().mockReturnValue({ run: null, error: null })
vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: (...args: unknown[]) => mockUseRealtimeRun(...args),
}))

const mockGetEpisodeStatus = vi.fn()
const mockGetRunReconnectionData = vi.fn()
const mockFetch = vi.fn()

vi.mock("@/app/actions/admin", () => ({
  getEpisodeStatus: (...args: unknown[]) => mockGetEpisodeStatus(...args),
  getRunReconnectionData: (...args: unknown[]) => mockGetRunReconnectionData(...args),
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
    mockUseRealtimeRun.mockReturnValue({ run: null, error: null })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ runId: "run_123", publicAccessToken: "tok_abc" }),
    })
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "available",
      summaryStatus: "completed",
      transcriptRunId: null,
      summaryRunId: null,
    })
    mockGetRunReconnectionData.mockResolvedValue({ ok: false, error: "No in-flight run" })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
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
      if (opts?.enabled) return { run: { status: "COMPLETED" }, error: null }
      return { run: null, error: null }
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
      expect(screen.getByRole("button", { name: /transcript available/i })).toBeDisabled()
    })
  })

  it("transcript run FAILED → local status updates to 'failed', shows error", async () => {
    mockUseRealtimeRun.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { enabled?: boolean } | undefined
      if (opts?.enabled) return { run: { status: "FAILED" }, error: null }
      return { run: null, error: null }
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
      if (opts?.enabled) return { run: { status: "CANCELED" }, error: null }
      return { run: null, error: null }
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
      if (opts?.enabled && summarizeTriggered) return { run: { status: "COMPLETED" }, error: null }
      return { run: null, error: null }
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
      if (opts?.enabled) return { run: { status: "FAILED" }, error: null }
      return { run: null, error: null }
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
      transcriptRunId: null,
      summaryRunId: null,
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
      transcriptRunId: null,
      summaryRunId: null,
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

  it("mount with transcriptStatus 'fetching' → getEpisodeStatus errors → surfaces recovery error", async () => {
    mockGetEpisodeStatus.mockRejectedValue(new Error("Network error"))
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "fetching" }}
      />
    )
    await waitFor(() => {
      expect(mockGetEpisodeStatus).toHaveBeenCalledWith(baseEpisode.id)
    })
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /could not verify status/i }).length
      ).toBeGreaterThanOrEqual(1)
    })
  })

  it("mount with transcriptStatus 'fetching' → getEpisodeStatus returns ok:false → surfaces server error", async () => {
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
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /admin access required/i }).length
      ).toBeGreaterThanOrEqual(1)
    })
  })

  it("mount with transcriptStatus 'available' → does NOT call getEpisodeStatus", async () => {
    render(<EpisodeActionButtons episode={baseEpisode} />)
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
        return { run: { status: "COMPLETED" }, error: null }
      }
      return { run: null, error: null }
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
      if (opts?.enabled) return { run: { status: "FAILED" }, error: null }
      return { run: null, error: null }
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
      if (opts?.enabled) return { run: { status: "FAILED" }, error: null }
      return { run: null, error: null }
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

  // --- useRealtimeRun connection errors ---

  it("transcript realtime error → shows 'Connection lost' and re-enables button", async () => {
    const wsError = new Error("WebSocket closed")
    // Return error when the hook is enabled (after click sets runId/token)
    mockUseRealtimeRun.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { enabled?: boolean } | undefined
      if (opts?.enabled) return { run: null, error: wsError }
      return { run: null, error: null }
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
        screen.getAllByRole("button", { name: /connection lost/i }).length
      ).toBeGreaterThanOrEqual(1)
    })
  })

  it("summary realtime error → shows 'Connection lost'", async () => {
    const sseError = new Error("SSE failed")
    // Both hooks called each render; return error only for summary (second call when enabled)
    let summarizeTriggered = false
    mockUseRealtimeRun.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { enabled?: boolean } | undefined
      if (opts?.enabled && summarizeTriggered) return { run: null, error: sseError }
      return { run: null, error: null }
    })
    render(<EpisodeActionButtons episode={baseEpisode} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }))
      summarizeTriggered = true
    })
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /connection lost/i })
      ).toBeInTheDocument()
    })
  })

  // --- Missing publicAccessToken ---

  it("fetch transcript API returns runId without publicAccessToken → shows tracking unavailable", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ runId: "run_123" }),
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
        screen.getAllByRole("button", { name: /task queued/i }).length
      ).toBeGreaterThanOrEqual(1)
    })
  })

  // --- Summarize HTTP failure ---

  it("standalone summarize HTTP failure shows error and re-enables button", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Rate limited" }),
    })
    render(<EpisodeActionButtons episode={baseEpisode} />)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^summarize$/i }))
    })
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /rate limited/i })
      ).toBeInTheDocument()
    })
  })

  // --- Mount-time recovery: summary in-progress ---

  it("mount with summaryStatus 'running' → one-shot getEpisodeStatus → detects 'completed'", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "available",
      summaryStatus: "completed",
      transcriptRunId: null,
      summaryRunId: null,
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, summaryStatus: "running" }}
      />
    )
    await waitFor(() => {
      expect(mockGetEpisodeStatus).toHaveBeenCalledWith(baseEpisode.id)
      expect(screen.getByRole("button", { name: /re-summarize/i })).toBeInTheDocument()
    })
  })

  it("mount with summaryStatus 'queued' → getEpisodeStatus returns ok:false → surfaces error", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: false,
      error: "Episode not found",
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, summaryStatus: "queued" }}
      />
    )
    await waitFor(() => {
      expect(mockGetEpisodeStatus).toHaveBeenCalledWith(baseEpisode.id)
    })
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /episode not found/i })
      ).toBeInTheDocument()
    })
  })

  // --- Mount-time reconnection via getRunReconnectionData ---

  it("mount with transcriptStatus 'fetching' + transcriptRunId → calls getRunReconnectionData → activates useRealtimeRun", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "fetching",
      summaryStatus: null,
      transcriptRunId: "run_reconnect_xyz",
      summaryRunId: null,
    })
    mockGetRunReconnectionData.mockResolvedValue({
      ok: true,
      runId: "run_reconnect_xyz",
      publicAccessToken: "tok_reconnect",
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "fetching" }}
      />
    )
    await waitFor(() => {
      expect(mockGetRunReconnectionData).toHaveBeenCalledWith(baseEpisode.id, "transcript")
      expect(mockUseRealtimeRun).toHaveBeenCalledWith("run_reconnect_xyz", {
        accessToken: "tok_reconnect",
        enabled: true,
      })
    })
  })

  it("mount with summaryStatus 'running' + summaryRunId → calls getRunReconnectionData → activates useRealtimeRun", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "available",
      summaryStatus: "running",
      transcriptRunId: null,
      summaryRunId: "run_summary_reconnect",
    })
    mockGetRunReconnectionData.mockResolvedValue({
      ok: true,
      runId: "run_summary_reconnect",
      publicAccessToken: "tok_summary_reconnect",
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, summaryStatus: "running" }}
      />
    )
    await waitFor(() => {
      expect(mockGetRunReconnectionData).toHaveBeenCalledWith(baseEpisode.id, "summary")
      expect(mockUseRealtimeRun).toHaveBeenCalledWith("run_summary_reconnect", {
        accessToken: "tok_summary_reconnect",
        enabled: true,
      })
    })
  })

  it("mount with in-progress status + getRunReconnectionData fails → falls back to failed state", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "fetching",
      summaryStatus: null,
      transcriptRunId: "run_xyz",
      summaryRunId: null,
    })
    mockGetRunReconnectionData.mockResolvedValue({ ok: false, error: "No in-flight run" })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "fetching" }}
      />
    )
    await waitFor(() => {
      expect(mockGetRunReconnectionData).toHaveBeenCalledWith(baseEpisode.id, "transcript")
      expect(
        screen.getAllByRole("button", { name: /could not reconnect/i }).length
      ).toBeGreaterThanOrEqual(1)
    })
  })

  it("mount with in-progress status + no run ID in status → does NOT call getRunReconnectionData", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "fetching",
      summaryStatus: null,
      transcriptRunId: null,
      summaryRunId: null,
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "fetching" }}
      />
    )
    await waitFor(() => {
      expect(mockGetEpisodeStatus).toHaveBeenCalledWith(baseEpisode.id)
    })
    expect(mockGetRunReconnectionData).not.toHaveBeenCalled()
  })

  // --- Staleness timeout ---

  it("transcript staleness timeout fires after subscription hangs", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /fetch transcript/i }))
    })
    // Advance past the 20-minute staleness guard
    await act(async () => {
      vi.advanceTimersByTime(20 * 60 * 1000 + 100)
    })
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: /fetch timed out/i }).length
      ).toBeGreaterThanOrEqual(1)
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
      if (opts?.enabled) return { run: { status: "FAILED" }, error: null }
      return { run: null, error: null }
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
