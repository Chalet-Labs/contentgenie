import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/components/admin/episodes/row-checkbox", () => ({
  RowCheckbox: ({ episodeId }: { episodeId: number }) => (
    <input type="checkbox" aria-label={`Select episode ${episodeId}`} />
  ),
}))

vi.mock("@/components/admin/episodes/episode-action-buttons", () => ({
  EpisodeActionButtons: () => <div data-testid="action-buttons" />,
}))

import { EpisodesTable } from "@/components/admin/episodes/episodes-table"
import type { EpisodeRow } from "@/lib/admin/episode-queries"

const makeEpisode = (id: number): EpisodeRow => ({
  id,
  title: `Episode ${id}`,
  podcastId: 1,
  podcastTitle: "Test Podcast",
  podcastImageUrl: null,
  podcastIndexId: `idx_${id}`,
  publishDate: new Date("2026-01-15"),
  transcriptStatus: "available",
  transcriptSource: "assemblyai",
  summaryStatus: "completed",
  worthItScore: "7.5",
})

describe("EpisodesTable", () => {
  it("renders episode rows", () => {
    const episodes = [makeEpisode(1), makeEpisode(2)]
    render(<EpisodesTable episodes={episodes} totalCount={2} currentPage={1} />)
    expect(screen.getByText("Episode 1")).toBeInTheDocument()
    expect(screen.getByText("Episode 2")).toBeInTheDocument()
  })

  it("shows 'No episodes' when empty", () => {
    render(<EpisodesTable episodes={[]} totalCount={0} currentPage={1} />)
    expect(screen.getByText("No episodes found.")).toBeInTheDocument()
  })

  it("shows pagination when totalCount > 25", () => {
    const episodes = Array.from({ length: 25 }, (_, i) => makeEpisode(i + 1))
    render(<EpisodesTable episodes={episodes} totalCount={50} currentPage={1} />)
    expect(screen.getByRole("link", { name: /next/i })).toBeInTheDocument()
  })

  it("does not show pagination when totalCount <= 25", () => {
    const episodes = Array.from({ length: 10 }, (_, i) => makeEpisode(i + 1))
    render(<EpisodesTable episodes={episodes} totalCount={10} currentPage={1} />)
    expect(screen.queryByRole("link", { name: /next/i })).not.toBeInTheDocument()
  })

  it("links episode title to /episode/<podcastIndexId>", () => {
    const ep = makeEpisode(1)
    render(<EpisodesTable episodes={[ep]} totalCount={1} currentPage={1} />)
    const link = screen.getByRole("link", { name: ep.title })
    expect(link).toHaveAttribute("href", `/episode/${ep.podcastIndexId}`)
  })
})
