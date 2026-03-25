import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const mockUpdateSummarizationPrompt = vi.fn()
const mockSearchEpisodes = vi.fn()

vi.mock("@/app/actions/ai-config", () => ({
  updateSummarizationPrompt: (...args: unknown[]) => mockUpdateSummarizationPrompt(...args),
}))

vi.mock("@/app/actions/admin", () => ({
  searchEpisodesWithTranscript: (...args: unknown[]) => mockSearchEpisodes(...args),
}))

import { PromptTemplateCard } from "../prompt-template-card"

describe("PromptTemplateCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateSummarizationPrompt.mockResolvedValue({ success: true })
    mockSearchEpisodes.mockResolvedValue({ results: [] })
  })

  it("renders textarea with initialPrompt value", () => {
    render(<PromptTemplateCard initialPrompt="Analyze {{transcript}}" />)
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    expect(textarea.value).toBe("Analyze {{transcript}}")
  })

  it("renders empty textarea when initialPrompt is null", () => {
    render(<PromptTemplateCard initialPrompt={null} />)
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    expect(textarea.value).toBe("")
  })

  it("shows {{transcript}} warning when absent from non-empty prompt", async () => {
    render(<PromptTemplateCard initialPrompt={null} />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "no placeholder here" } })
    await waitFor(() => {
      expect(screen.getByText(/warning.*transcript/i)).toBeInTheDocument()
    })
  })

  it("does not show warning when prompt contains {{transcript}}", async () => {
    render(<PromptTemplateCard initialPrompt="Analyze {{transcript}}" />)
    expect(screen.queryByText(/warning/i)).not.toBeInTheDocument()
  })

  it("Save button is disabled when {{transcript}} is missing", async () => {
    render(<PromptTemplateCard initialPrompt={null} />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "no placeholder" } })
    await waitFor(() => {
      const saveBtn = screen.getByRole("button", { name: /save/i })
      expect(saveBtn).toBeDisabled()
    })
  })

  it("Test Prompt button is disabled when no episode selected", () => {
    render(<PromptTemplateCard initialPrompt="Analyze {{transcript}}" />)
    const testBtn = screen.getByRole("button", { name: /test prompt/i })
    expect(testBtn).toBeDisabled()
  })

  it("calls updateSummarizationPrompt with current textarea value on Save", async () => {
    render(<PromptTemplateCard initialPrompt="Analyze {{transcript}}" />)
    const saveBtn = screen.getByRole("button", { name: /^save$/i })
    fireEvent.click(saveBtn)
    await waitFor(() => {
      expect(mockUpdateSummarizationPrompt).toHaveBeenCalledWith("Analyze {{transcript}}")
    })
  })
})
