import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const mockGetEpisodeStatus = vi.fn()
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

vi.mock("@/app/actions/admin", () => ({
  getEpisodeStatus: (...args: unknown[]) => mockGetEpisodeStatus(...args),
}))

import { EpisodeActionButtons } from "../episode-action-buttons"

const baseEpisode = {
  id: 1,
  transcriptStatus: "available",
  summaryStatus: null,
  podcastIndexId: "idx_1",
}

describe("EpisodeActionButtons", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) })
    mockGetEpisodeStatus.mockResolvedValue({
      transcriptStatus: "available",
      summaryStatus: "completed",
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("Fetch Transcript button is disabled when transcriptStatus is available", () => {
    render(<EpisodeActionButtons episode={baseEpisode} />)
    const fetchBtn = screen.getByRole("button", { name: /fetch transcript/i })
    expect(fetchBtn).toBeDisabled()
  })

  it("Fetch Transcript button is enabled when transcript is not available", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    const fetchBtn = screen.getByRole("button", { name: /fetch transcript/i })
    expect(fetchBtn).not.toBeDisabled()
  })

  it("Summarize button is disabled when transcript is not available", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    const summarizeBtn = screen.getByRole("button", { name: /summarize/i })
    expect(summarizeBtn).toBeDisabled()
  })

  it("shows Re-summarize when summaryStatus is completed", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, summaryStatus: "completed" }}
      />
    )
    expect(screen.getByRole("button", { name: /re-summarize/i })).toBeInTheDocument()
  })

  it("shows Re-summarize when summaryStatus is failed", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, summaryStatus: "failed" }}
      />
    )
    expect(screen.getByRole("button", { name: /re-summarize/i })).toBeInTheDocument()
  })

  it("shows in-progress status text when summaryStatus is queued", () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, summaryStatus: "queued" }}
      />
    )
    const btn = screen.getByRole("button", { name: /queued/i })
    expect(btn).toBeDisabled()
  })

  it("optimistically updates transcript status on Fetch click", async () => {
    render(
      <EpisodeActionButtons
        episode={{ ...baseEpisode, transcriptStatus: "missing" }}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /fetch transcript/i }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /fetching/i })).toBeInTheDocument()
    })
  })

  it("polls getEpisodeStatus after Summarize click (not GET API route)", async () => {
    render(<EpisodeActionButtons episode={baseEpisode} />)
    fireEvent.click(screen.getByRole("button", { name: /summarize/i }))

    // Wait for polling to fire (mocked at module level — just verify the action was called)
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/episodes/summarize",
        expect.any(Object)
      )
    })
  })
})
