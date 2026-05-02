import Link from "next/link";
import { getCanonicalEpisodeCountDrift } from "@/app/actions/topics";
import { DriftTable } from "@/components/admin/topics/drift-table";

export default async function AdminTopicsDriftPage() {
  const result = await getCanonicalEpisodeCountDrift();
  const rows = result.success ? result.data : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Merge-cleanup drift</h2>
        <Link
          href="/admin/topics"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to topics
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Merged canonical topics with orphaned junction rows. Each row indicates
        a merge-pipeline bug (ADR-046 §3 path-compression invariant violated).
      </p>
      <DriftTable rows={rows} />
    </div>
  );
}
