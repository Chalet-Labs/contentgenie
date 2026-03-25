import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { StatusBadge } from "../status-badge"

describe("StatusBadge", () => {
  it("renders green for available", () => {
    const { container } = render(<StatusBadge status="available" />)
    expect(container.firstChild).toHaveClass("bg-green-100")
  })

  it("renders green for completed", () => {
    const { container } = render(<StatusBadge status="completed" />)
    expect(container.firstChild).toHaveClass("bg-green-100")
  })

  it("renders yellow for fetching", () => {
    const { container } = render(<StatusBadge status="fetching" />)
    expect(container.firstChild).toHaveClass("bg-yellow-100")
  })

  it("renders yellow for running", () => {
    const { container } = render(<StatusBadge status="running" />)
    expect(container.firstChild).toHaveClass("bg-yellow-100")
  })

  it("renders yellow for summarizing", () => {
    const { container } = render(<StatusBadge status="summarizing" />)
    expect(container.firstChild).toHaveClass("bg-yellow-100")
  })

  it("renders blue for queued", () => {
    const { container } = render(<StatusBadge status="queued" />)
    expect(container.firstChild).toHaveClass("bg-blue-100")
  })

  it("renders red for failed", () => {
    const { container } = render(<StatusBadge status="failed" />)
    expect(container.firstChild).toHaveClass("bg-red-100")
  })

  it("renders gray for missing", () => {
    const { container } = render(<StatusBadge status="missing" />)
    expect(container.firstChild).toHaveClass("bg-gray-100")
  })

  it("renders gray for null", () => {
    const { container } = render(<StatusBadge status={null} />)
    expect(container.firstChild).toHaveClass("bg-gray-100")
    expect(screen.getByText("none")).toBeInTheDocument()
  })
})
