import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { EpisodesTableShell } from "@/components/admin/episodes/episodes-table-shell"
import { RowCheckbox } from "@/components/admin/episodes/row-checkbox"

function TestChild({ episodeId }: { episodeId: number }) {
  return <RowCheckbox episodeId={episodeId} />
}

describe("EpisodesTableShell", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("does not show batch toolbar when nothing is selected", () => {
    render(
      <EpisodesTableShell>
        <TestChild episodeId={1} />
      </EpisodesTableShell>
    )
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument()
  })

  it("shows batch toolbar after selecting a checkbox", async () => {
    render(
      <EpisodesTableShell>
        <TestChild episodeId={1} />
      </EpisodesTableShell>
    )
    const checkbox = screen.getByRole("checkbox", { name: /select episode 1/i })
    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(screen.getByText(/1 selected/i)).toBeInTheDocument()
    })
  })

  it("calls POST /api/admin/batch-resummarize with correct IDs on click", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ queued: 1, skipped: 0 }),
    })

    render(
      <EpisodesTableShell>
        <TestChild episodeId={42} />
      </EpisodesTableShell>
    )

    fireEvent.click(screen.getByRole("checkbox", { name: /select episode 42/i }))
    await waitFor(() => screen.getByRole("button", { name: /re-summarize selected/i }))
    fireEvent.click(screen.getByRole("button", { name: /re-summarize selected/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/batch-resummarize",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ episodeIds: [42] }),
        })
      )
    })
  })

  it("shows success toast after successful batch resummarize", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ queued: 2, skipped: 0 }),
    })

    const { toast } = vi.mocked(await import("sonner"))

    render(
      <EpisodesTableShell>
        <TestChild episodeId={1} />
        <TestChild episodeId={2} />
      </EpisodesTableShell>
    )

    fireEvent.click(screen.getByRole("checkbox", { name: /select episode 1/i }))
    fireEvent.click(screen.getByRole("checkbox", { name: /select episode 2/i }))
    await waitFor(() => screen.getByRole("button", { name: /re-summarize selected/i }))
    fireEvent.click(screen.getByRole("button", { name: /re-summarize selected/i }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("queued"))
    })
  })
})
