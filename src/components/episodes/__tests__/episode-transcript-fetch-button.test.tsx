import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockGetEpisodeStatus = vi.fn()
const mockFetch = vi.fn()

vi.mock("@/app/actions/admin", () => ({
  getEpisodeStatus: (...args: unknown[]) => mockGetEpisodeStatus(...args),
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}))

import { toast } from "sonner"
import { EpisodeTranscriptFetchButton } from "@/components/episodes/episode-transcript-fetch-button"
import type { TranscriptStatus } from "@/db/schema"

const baseProps = {
  episodeDbId: 42,
  podcastIndexId: "123",
  transcriptStatus: "missing" as TranscriptStatus | null,
  onTranscriptReady: vi.fn(),
}

describe("EpisodeTranscriptFetchButton", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal("fetch", mockFetch)
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "queued" }),
    })
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "available",
      summaryStatus: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  // --- Test case 1: missing ---

  it("renders 'Fetch & Summarize' button when transcriptStatus is 'missing'", () => {
    render(<EpisodeTranscriptFetchButton {...baseProps} transcriptStatus="missing" />)
    expect(
      screen.getByRole("button", { name: /fetch & summarize/i })
    ).toBeInTheDocument()
  })

  // --- Test case 2: failed ---

  it("renders 'Fetch & Summarize' button when transcriptStatus is 'failed'", () => {
    render(<EpisodeTranscriptFetchButton {...baseProps} transcriptStatus="failed" />)
    expect(
      screen.getByRole("button", { name: /fetch & summarize/i })
    ).toBeInTheDocument()
  })

  // --- fetching on mount → spinner + polling starts ---

  it("shows disabled spinner when mounted with transcriptStatus 'fetching'", () => {
    render(<EpisodeTranscriptFetchButton {...baseProps} transcriptStatus="fetching" />)
    expect(
      screen.getByRole("button", { name: /fetching transcript/i })
    ).toBeDisabled()
  })

  it("starts polling on mount when transcriptStatus is 'fetching'", async () => {
    render(<EpisodeTranscriptFetchButton {...baseProps} transcriptStatus="fetching" />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(mockGetEpisodeStatus).toHaveBeenCalledWith(baseProps.episodeDbId)
  })

  // --- Test case 3: available → null ---

  it("renders nothing when transcriptStatus is 'available'", () => {
    const { container } = render(
      <EpisodeTranscriptFetchButton {...baseProps} transcriptStatus="available" />
    )
    expect(container).toBeEmptyDOMElement()
  })

  // --- Test case 4: null → null ---

  it("renders nothing when transcriptStatus is null", () => {
    const { container } = render(
      <EpisodeTranscriptFetchButton {...baseProps} transcriptStatus={null} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  // --- Test case 5: RSS disabled ---

  it("renders disabled button with tooltip for RSS-sourced episodes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <EpisodeTranscriptFetchButton
        {...baseProps}
        podcastIndexId="rss-abc123"
        transcriptStatus="missing"
      />
    )
    const btn = screen.getByRole("button", { name: /fetch & summarize/i })
    expect(btn).toBeDisabled()
    await user.hover(btn.closest("span") ?? btn)
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent(/rss episodes/i)
    })
  })

  // --- Test case 6: optimistic spinner on click ---

  it("shows spinner and disables button on click (optimistic update)", async () => {
    // Keep fetch hanging so we stay in loading state
    mockFetch.mockReturnValue(new Promise(() => {}))
    render(<EpisodeTranscriptFetchButton {...baseProps} />)
    fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /fetching transcript/i })
      ).toBeDisabled()
    })
  })

  // --- Test case 7: POST body uses episodeDbId ---

  it("POSTs to /api/episodes/fetch-transcript with episodeDbId", async () => {
    render(<EpisodeTranscriptFetchButton {...baseProps} />)
    fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/fetch-transcript",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ episodeId: baseProps.episodeDbId }),
        })
      )
    })
  })

  // --- Test case 8: polling starts after successful POST ---

  it("polls getEpisodeStatus after a successful POST", async () => {
    render(<EpisodeTranscriptFetchButton {...baseProps} />)
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
    expect(mockGetEpisodeStatus).toHaveBeenCalledWith(baseProps.episodeDbId)
  })

  // --- Test case 9: onTranscriptReady on "available" ---

  it("calls onTranscriptReady when polling detects 'available'", async () => {
    const onTranscriptReady = vi.fn()
    render(
      <EpisodeTranscriptFetchButton
        {...baseProps}
        onTranscriptReady={onTranscriptReady}
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
      expect(onTranscriptReady).toHaveBeenCalledTimes(1)
    })
  })

  // --- Test case 10: "failed" → error toast + re-enable ---

  it("shows toast error when polling detects 'failed' transcript status", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "failed",
      summaryStatus: null,
    })
    render(<EpisodeTranscriptFetchButton {...baseProps} />)
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
      expect(vi.mocked(toast.error)).toHaveBeenCalled()
    })
  })

  it("re-enables button after polling detects 'failed' transcript status", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "failed",
      summaryStatus: null,
    })
    render(<EpisodeTranscriptFetchButton {...baseProps} />)
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
      expect(
        screen.getByRole("button", { name: /fetch & summarize/i })
      ).toBeInTheDocument()
    })
  })

  // --- Test case 10b: ok: false from getEpisodeStatus ---

  it("shows toast error when getEpisodeStatus returns ok: false", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: false,
      error: "Admin access required",
    })
    render(<EpisodeTranscriptFetchButton {...baseProps} />)
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
      expect(vi.mocked(toast.error)).toHaveBeenCalled()
    })
  })

  // --- HTTP failure on POST → toast + re-enable ---

  it("shows toast error when fetch POST fails (HTTP error)", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    })
    render(<EpisodeTranscriptFetchButton {...baseProps} />)
    fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalled()
    })
  })

  it("re-enables button after fetch POST HTTP error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    })
    render(<EpisodeTranscriptFetchButton {...baseProps} />)
    fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /fetch & summarize/i })
      ).toBeInTheDocument()
    })
  })

  // --- Network failure on POST → toast + re-enable ---

  it("shows toast error and re-enables button when fetch throws (network failure)", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"))
    render(<EpisodeTranscriptFetchButton {...baseProps} />)
    fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalled()
      expect(
        screen.getByRole("button", { name: /fetch & summarize/i })
      ).toBeInTheDocument()
    })
  })

  // --- Test case 11: poll timeout ---

  it("shows toast error and re-enables button on poll timeout (240 polls)", async () => {
    mockGetEpisodeStatus.mockResolvedValue({
      ok: true,
      transcriptStatus: "fetching",
      summaryStatus: null,
    })
    render(<EpisodeTranscriptFetchButton {...baseProps} />)
    fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/fetch-transcript",
        expect.any(Object)
      )
    )
    // 240 polls × 5s = 1200s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(240 * 5000 + 1000)
    })
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalled()
      expect(
        screen.getByRole("button", { name: /fetch & summarize/i })
      ).toBeInTheDocument()
    })
  })

  // --- Poll exception → toast + re-enable ---

  it("shows toast error and re-enables button when getEpisodeStatus throws", async () => {
    mockGetEpisodeStatus.mockRejectedValue(new Error("Network error"))
    render(<EpisodeTranscriptFetchButton {...baseProps} />)
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
      expect(vi.mocked(toast.error)).toHaveBeenCalled()
      expect(
        screen.getByRole("button", { name: /fetch & summarize/i })
      ).toBeInTheDocument()
    })
  })

  // --- Test case 12: cleanup on unmount ---

  it("clears the poll interval on unmount", async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")
    const { unmount } = render(<EpisodeTranscriptFetchButton {...baseProps} />)
    fireEvent.click(screen.getByRole("button", { name: /fetch & summarize/i }))
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/fetch-transcript",
        expect.any(Object)
      )
    )
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})
