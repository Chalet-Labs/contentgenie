import Link from "next/link";
import { getCanonicalEpisodeCountDrift } from "@/app/actions/topics";
import { DriftTable } from "@/components/admin/topics/drift-table";

function DriftPageHeader() {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">Merge-cleanup drift</h2>
      <Link
        href="/admin/topics"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to topics
      </Link>
    </div>
  );
}

export default async function AdminTopicsDriftPage() {
  const result = await getCanonicalEpisodeCountDrift();

  if (!result.success) {
    // Reporting "no drift" on a backend failure defeats the whole point of
    // this page (it exists to detect bugs). Surface the error explicitly.
    return (
      <div className="space-y-4">
        <DriftPageHeader />
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          Failed to load merge-cleanup drift: {result.error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DriftPageHeader />
      <p className="text-sm text-muted-foreground">
        Merged canonical topics with orphaned junction rows. Each row indicates
        a merge-pipeline bug (path-compression invariant violated — see
        ADR-049).
      </p>
      <DriftTable rows={result.data} />
    </div>
  );
}
