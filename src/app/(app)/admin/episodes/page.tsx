import { db } from "@/db"
import { podcasts } from "@/db/schema"
import { loadAdminEpisodeSearchParams } from "@/lib/search-params/admin-episodes"
import { getFilteredEpisodes } from "@/lib/admin/episode-queries"
import { EpisodeFiltersBar } from "@/components/admin/episodes/episode-filters"
import { EpisodesTableShell } from "@/components/admin/episodes/episodes-table-shell"
import { EpisodesTable } from "@/components/admin/episodes/episodes-table"
import type { EpisodeFilters } from "@/lib/admin/episode-filters"

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
  const parsed = loadAdminEpisodeSearchParams(searchParams)

  const filters: EpisodeFilters = {
    podcastId: parsed.podcastId ?? undefined,
    transcriptStatuses: parsed.transcriptStatus?.filter(Boolean) ?? undefined,
    summaryStatuses: parsed.summaryStatus?.filter(Boolean) ?? undefined,
    dateFrom: parsed.dateFrom ?? undefined,
    dateTo: parsed.dateTo ?? undefined,
    page: parsed.page > 0 ? parsed.page : 1,
  }

  const [{ rows, totalCount }, podcastList] = await Promise.all([
    getFilteredEpisodes(filters),
    getPodcastList(),
  ])

  return (
    <div className="space-y-4">
      <EpisodeFiltersBar podcasts={podcastList} />
      <EpisodesTableShell>
        <EpisodesTable
          episodes={rows}
          totalCount={totalCount}
          currentPage={filters.page}
          searchParams={searchParams}
        />
      </EpisodesTableShell>
    </div>
  )
}
