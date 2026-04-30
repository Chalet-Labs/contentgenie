import { neon } from "@neondatabase/serverless";
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

  console.log(
    "[AdminTopicsPage] searchParams:",
    JSON.stringify(searchParams),
    "parsed:",
    JSON.stringify(parsed),
    "DB_URL prefix:",
    process.env.DATABASE_URL?.slice(0, 30),
  );
  // debug: raw SQL count
  const rawSql = neon(process.env.DATABASE_URL!);
  const rawCount =
    await rawSql`SELECT COUNT(*)::integer as c FROM canonical_topics`;
  console.log("[AdminTopicsPage] raw SQL count:", rawCount[0]?.c);
  const { rows, totalCount } = await getCanonicalTopicsListQuery({
    search: parsed.search ?? undefined,
    status: parsed.status ?? undefined,
    kind: parsed.kind ?? undefined,
    page: parsed.page > 0 ? parsed.page : 1,
  });
  console.log(
    "[AdminTopicsPage] rows:",
    rows.length,
    "totalCount:",
    totalCount,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Canonical Topics</h2>
        <span className="text-sm text-muted-foreground">
          {totalCount} total
        </span>
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
