import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockRecordListenEvent = vi.fn()
vi.mock("@/app/actions/listen-history", () => ({
  recordListenEvent: (...args: unknown[]) => mockRecordListenEvent(...args),
}))

vi.mock("@/lib/events", () => ({
  LISTEN_STATE_CHANGED_EVENT: "listen-state-changed",
}))

describe("ListenedButton", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecordListenEvent.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("renders a button with aria-label 'Mark as listened' when isListened is false", async () => {
    const { ListenedButton } = await import("@/components/episodes/listened-button")
    render(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={false} />)
    expect(screen.getByRole("button", { name: "Mark as listened" })).toBeInTheDocument()
  })

  it("renders non-button indicator with aria-label 'Already listened' when isListened is true", async () => {
    const { ListenedButton } = await import("@/components/episodes/listened-button")
    render(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={true} />)
    expect(screen.queryByRole("button", { name: "Mark as listened" })).toBeNull()
    expect(screen.getByLabelText("Already listened")).toBeInTheDocument()
  })

  it("optimistically flips UI immediately on click before action resolves", async () => {
    let resolveAction!: (v: { success: boolean }) => void
    mockRecordListenEvent.mockReturnValue(
      new Promise((res) => { resolveAction = res }),
    )

    const { ListenedButton } = await import("@/components/episodes/listened-button")
    const user = userEvent.setup()
    render(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={false} />)

    const btn = screen.getByRole("button", { name: "Mark as listened" })
    await user.click(btn)

    // Icon should flip immediately — button should be gone
    expect(screen.queryByRole("button", { name: "Mark as listened" })).toBeNull()
    expect(screen.getByLabelText("Already listened")).toBeInTheDocument()

    // Settle the pending promise to clean up
    await act(async () => { resolveAction({ success: true }) })
  })

  it("reverts and shows error toast when action fails", async () => {
    mockRecordListenEvent.mockResolvedValue({ success: false, error: "boom" })

    const { ListenedButton } = await import("@/components/episodes/listened-button")
    const { toast } = await import("sonner")
    const user = userEvent.setup()
    render(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={false} />)

    await user.click(screen.getByRole("button", { name: "Mark as listened" }))

    // After settling the button should be back
    expect(screen.getByRole("button", { name: "Mark as listened" })).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith("boom")
  })

  it("dispatches LISTEN_STATE_CHANGED_EVENT on success", async () => {
    mockRecordListenEvent.mockResolvedValue({ success: true })

    const { ListenedButton } = await import("@/components/episodes/listened-button")
    const dispatchSpy = vi.spyOn(window, "dispatchEvent")
    const user = userEvent.setup()
    render(<ListenedButton podcastIndexEpisodeId="ep-1" isListened={false} />)

    await user.click(screen.getByRole("button", { name: "Mark as listened" }))

    const dispatched = dispatchSpy.mock.calls.find(
      ([e]) => e instanceof CustomEvent && (e as CustomEvent).type === "listen-state-changed",
    )
    expect(dispatched).toBeTruthy()
  })
})
