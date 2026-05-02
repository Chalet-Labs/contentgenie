import Link from "next/link";
import { loadAdminTopicSearchParams } from "@/lib/search-params/admin-topics";
import { getCanonicalTopicsListQuery } from "@/lib/admin/topic-queries";
import { TopicsFiltersBar } from "@/components/admin/topics/topics-filters-bar";
import { TopicsTable } from "@/components/admin/topics/topics-table";

export default async function AdminTopicsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const parsed = loadAdminTopicSearchParams(searchParams);

  // Map the tri-state ongoing string → boolean for the query layer.
  const ongoingFilter =
    parsed.ongoing === "yes"
      ? true
      : parsed.ongoing === "no"
        ? false
        : undefined;

  const { rows, totalCount } = await getCanonicalTopicsListQuery({
    search: parsed.search ?? undefined,
    status: parsed.status ?? undefined,
    kind: parsed.kind ?? undefined,
    ongoing: ongoingFilter,
    episodeCountMin: parsed.episodeCountMin ?? undefined,
    episodeCountMax: parsed.episodeCountMax ?? undefined,
    page: parsed.page > 0 ? parsed.page : 1,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Canonical Topics</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {totalCount} total
          </span>
          <Link
            href="/admin/topics/drift"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            View merge-cleanup drift →
          </Link>
        </div>
      </div>
      <TopicsFiltersBar />
      <TopicsTable
        rows={rows}
        totalCount={totalCount}
        currentPage={parsed.page > 0 ? parsed.page : 1}
        searchParams={searchParams}
      />
    </div>
  );
}
