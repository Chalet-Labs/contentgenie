import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"

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
  podcastIndexId: "idx_1",
}

describe("EpisodeActionButtons", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal("fetch", mockFetch)
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "available",
      summaryStatus: "completed",
    })
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it("combined action does NOT call /api/episodes/summarize when transcript fetch fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, text: async () => "Server error" })
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

  it("combined action sets error message 'Transcript fetch failed' when polling returns failed status", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "failed",
      summaryStatus: null,
    })
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await waitFor(() => {
      const errorBtns = screen.getAllByRole("button", {
        name: /transcript fetch failed/i,
      })
      expect(errorBtns).toHaveLength(2)
    })
  })

  it("combined action chains to summarize when polling detects transcript available", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "available",
      summaryStatus: null,
    })
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/summarize",
        expect.any(Object)
      )
    })
  })

  // --- Individual buttons disabled during combined action ---

  it("Fetch Transcript button is disabled during a combined action chain", async () => {
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

  it("Summarize button is disabled during a combined action chain", async () => {
    // Mock set so polling would return "available" — but no timer advance happens,
    // so transcript is still "fetching" at assertion time
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "available",
      summaryStatus: null,
    })
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

  // --- Combined action error paths ---

  it("combined action: buttons re-enable when getEpisodeStatus returns { ok: false }", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: false,
      error: "Admin access required",
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
      await vi.advanceTimersByTimeAsync(100)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await waitFor(() => {
      const errorBtns = screen.getAllByRole("button", { name: /admin access required/i })
      errorBtns.forEach(btn => expect(btn).not.toBeDisabled())
    })
  })

  it("combined action: fetch HTTP failure shows error and re-enables buttons", async () => {
    mockFetch.mockResolvedValue({ ok: false, text: async () => "Server error", status: 500 })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
      await vi.advanceTimersByTimeAsync(100)
    })
    await waitFor(() => {
      const errorBtns = screen.getAllByRole("button", { name: /server error/i })
      errorBtns.forEach(btn => expect(btn).not.toBeDisabled())
    })
  })

  it("standalone transcript fetch failure shows error message", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "failed",
      summaryStatus: null,
    })
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /fetch transcript/i }))
      await vi.advanceTimersByTimeAsync(100)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await waitFor(() => {
      const errorBtns = screen.getAllByRole("button", {
        name: /transcript fetch failed/i,
      })
      expect(errorBtns.length).toBeGreaterThanOrEqual(1)
    })
  })
})
