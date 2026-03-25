import { eq } from "drizzle-orm"
import { db } from "@/db"
import { podcasts } from "@/db/schema"
import { parseEpisodeFilters } from "@/lib/admin/episode-filters"
import { getFilteredEpisodes } from "@/lib/admin/episode-queries"
import { EpisodeFiltersBar } from "@/components/admin/episodes/episode-filters"
import { EpisodesTableShell } from "@/components/admin/episodes/episodes-table-shell"
import { EpisodesTable } from "@/components/admin/episodes/episodes-table"

// Note: 500-row limit is sufficient at current scale.
// If podcast count grows, switch to server-side search.
async function getPodcastList() {
  return db
    .select({ id: podcasts.id, title: podcasts.title })
    .from(podcasts)
    .orderBy(podcasts.title)
    .limit(500)
}

export default async function AdminEpisodesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const filters = parseEpisodeFilters(searchParams)

  const [{ rows, totalCount }, podcastList] = await Promise.all([
    getFilteredEpisodes(filters),
    getPodcastList(),
  ])

  return (
    <div className="space-y-4">
      <EpisodeFiltersBar podcasts={podcastList} initialFilters={filters} />
      <EpisodesTableShell>
        <EpisodesTable
          episodes={rows}
          totalCount={totalCount}
          currentPage={filters.page}
        />
      </EpisodesTableShell>
    </div>
  )
}
