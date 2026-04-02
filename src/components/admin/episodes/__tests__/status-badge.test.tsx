import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { StatusBadge } from "@/components/admin/episodes/status-badge"

describe("StatusBadge", () => {
  it("renders success style for available", () => {
    const { container } = render(<StatusBadge status="available" />)
    expect(container.firstChild).toHaveClass("bg-status-success-bg")
  })

  it("renders success style for completed", () => {
    const { container } = render(<StatusBadge status="completed" />)
    expect(container.firstChild).toHaveClass("bg-status-success-bg")
  })

  it("renders warning style for fetching", () => {
    const { container } = render(<StatusBadge status="fetching" />)
    expect(container.firstChild).toHaveClass("bg-status-warning-bg")
  })

  it("renders warning style for running", () => {
    const { container } = render(<StatusBadge status="running" />)
    expect(container.firstChild).toHaveClass("bg-status-warning-bg")
  })

  it("renders warning style for summarizing", () => {
    const { container } = render(<StatusBadge status="summarizing" />)
    expect(container.firstChild).toHaveClass("bg-status-warning-bg")
  })

  it("renders info style for queued", () => {
    const { container } = render(<StatusBadge status="queued" />)
    expect(container.firstChild).toHaveClass("bg-status-info-bg")
  })

  it("renders danger style for failed", () => {
    const { container } = render(<StatusBadge status="failed" />)
    expect(container.firstChild).toHaveClass("bg-status-danger-bg")
  })

  it("renders neutral style for missing", () => {
    const { container } = render(<StatusBadge status="missing" />)
    expect(container.firstChild).toHaveClass("bg-status-neutral-bg")
  })

  it("renders neutral style for null with 'unprocessed' label", () => {
    const { container } = render(<StatusBadge status={null} />)
    expect(container.firstChild).toHaveClass("bg-status-neutral-bg")
    expect(screen.getByText("unprocessed")).toBeInTheDocument()
  })
})
