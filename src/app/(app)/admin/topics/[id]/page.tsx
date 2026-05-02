import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, count } from "drizzle-orm";
import { db } from "@/db";
import { canonicalTopicAliases, episodeCanonicalTopics } from "@/db/schema";
import {
  getAdminAuditLogQuery,
  getUnmergeSuggestionsQuery,
  getLinkedEpisodesForTopicQuery,
} from "@/lib/admin/topic-queries";
import { AuditLogList } from "@/components/admin/topics/audit-log-list";
import { AliasesPanel } from "@/components/admin/topics/aliases-panel";
import { LinkedEpisodesPanel } from "@/components/admin/topics/linked-episodes-panel";
import {
  walkMergedChain,
  findTopicSummary,
} from "@/app/(app)/topic/[id]/merge-walker";
import { UnmergeDialogTrigger } from "@/components/admin/topics/unmerge-dialog-trigger";
import { MergeDialogTrigger } from "@/components/admin/topics/merge-dialog-trigger";

export default async function AdminTopicDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!/^\d+$/.test(params.id)) notFound();
  const id = Number(params.id);

  const topic = await findTopicSummary(id);

  if (!topic) notFound();

  const [aliases, linkedEpisodes, auditData] = await Promise.all([
    db
      .select({
        id: canonicalTopicAliases.id,
        alias: canonicalTopicAliases.alias,
      })
      .from(canonicalTopicAliases)
      .where(eq(canonicalTopicAliases.canonicalTopicId, id))
      .orderBy(canonicalTopicAliases.alias),
    getLinkedEpisodesForTopicQuery(id, { limit: 100 }),
    getAdminAuditLogQuery({ canonicalId: id, page: 1 }),
  ]);

  // Walk the merge chain if this topic is merged
  const walkerResult =
    topic.status === "merged" ? await walkMergedChain(topic) : null;

  const suggestedEpisodes =
    topic.status === "merged" ? await getUnmergeSuggestionsQuery(id) : [];

  // Per ADR-049 §1 + PM note 3: only query orphan count for merged topics.
  // Zero-cost for active/dormant — skip the query entirely.
  let orphanedJunctionCount = 0;
  if (topic.status === "merged") {
    const [{ n }] = await db
      .select({ n: count() })
      .from(episodeCanonicalTopics)
      .where(eq(episodeCanonicalTopics.canonicalTopicId, id));
    orphanedJunctionCount = Number(n);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{topic.label}</h2>
        <p className="text-sm text-muted-foreground">
          #{topic.id} · {topic.kind} · {topic.status} · {topic.episodeCount}{" "}
          episode(s)
        </p>
      </div>

      {topic.status === "merged" && walkerResult && (
        <div className="rounded-md border p-4">
          {"terminal" in walkerResult ? (
            <p className="text-sm">
              Merged into:{" "}
              <a
                href={`/admin/topics/${walkerResult.terminal.id}`}
                className="underline"
              >
                {walkerResult.terminal.label}
              </a>
            </p>
          ) : (
            <p className="text-sm text-destructive">
              Merge chain error: {walkerResult.error}
            </p>
          )}
        </div>
      )}

      {topic.status === "merged" && orphanedJunctionCount > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">
            Merge cleanup incomplete: {orphanedJunctionCount} orphaned junction
            row(s).{" "}
            <Link href="/admin/topics/drift" className="underline">
              See drift page.
            </Link>
          </p>
        </div>
      )}

      {topic.status === "active" && (
        <MergeDialogTrigger
          topic={{
            id: topic.id,
            label: topic.label,
            kind: topic.kind,
            status: topic.status,
            episodeCount: topic.episodeCount,
            lastSeen: new Date(),
            mergedIntoId: topic.mergedIntoId,
          }}
        />
      )}

      {topic.status === "merged" && (
        <UnmergeDialogTrigger
          topic={topic}
          suggestedEpisodes={suggestedEpisodes}
        />
      )}

      <section>
        <h3 className="mb-2 font-medium">Aliases</h3>
        <AliasesPanel canonicalId={id} aliases={aliases} />
      </section>

      <section>
        <h3 className="mb-2 font-medium">Linked Episodes (up to 100)</h3>
        <LinkedEpisodesPanel episodes={linkedEpisodes} />
      </section>

      <section>
        <h3 className="mb-2 font-medium">Audit Log</h3>
        <AuditLogList rows={auditData.rows} />
      </section>
    </div>
  );
}
