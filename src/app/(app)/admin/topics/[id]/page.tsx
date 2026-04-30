import { notFound } from "next/navigation";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  canonicalTopics,
  canonicalTopicAliases,
  canonicalTopicAdminLog,
  episodeCanonicalTopics,
  episodes,
} from "@/db/schema";
import { getAdminAuditLogQuery } from "@/lib/admin/topic-queries";
import { AuditLogList } from "@/components/admin/topics/audit-log-list";
import {
  walkMergedChain,
  TOPIC_DISPLAY_COLUMNS,
} from "@/app/(app)/topic/[id]/merge-walker";
import { UnmergeDialogTrigger } from "@/components/admin/topics/unmerge-dialog-trigger";

export default async function AdminTopicDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!/^\d+$/.test(params.id)) notFound();
  const id = Number(params.id);

  const topic = await db.query.canonicalTopics.findFirst({
    columns: TOPIC_DISPLAY_COLUMNS,
    where: eq(canonicalTopics.id, id),
  });

  if (!topic) notFound();

  const [aliases, recentJunctions, auditData] = await Promise.all([
    db
      .select({
        id: canonicalTopicAliases.id,
        alias: canonicalTopicAliases.alias,
      })
      .from(canonicalTopicAliases)
      .where(eq(canonicalTopicAliases.canonicalTopicId, id))
      .orderBy(canonicalTopicAliases.alias),
    db
      .select({
        episodeId: episodeCanonicalTopics.episodeId,
        episodeTitle: episodes.title,
      })
      .from(episodeCanonicalTopics)
      .innerJoin(episodes, eq(episodeCanonicalTopics.episodeId, episodes.id))
      .where(eq(episodeCanonicalTopics.canonicalTopicId, id))
      .orderBy(desc(episodes.publishDate))
      .limit(20),
    getAdminAuditLogQuery({ canonicalId: id, page: 1 }),
  ]);

  // Walk the merge chain if this topic is merged
  const walkerResult =
    topic.status === "merged" ? await walkMergedChain(topic) : null;

  // Suggest episodes from the most recent merge audit row.
  // After a merge, the loser has zero junctions (all moved to winner), so we
  // cannot derive the list from the live junction table. The audit log stores
  // both reassigned episode IDs (rows that moved to the winner) and
  // conflict_episode_ids (rows the loser dropped because the winner already
  // had them). ADR-046 §7 requires both to be candidates for re-attachment.
  let suggestedEpisodes: { id: number; title: string }[] = [];
  if (topic.status === "merged") {
    const latestMergeRow = await db
      .select({ metadata: canonicalTopicAdminLog.metadata })
      .from(canonicalTopicAdminLog)
      .where(eq(canonicalTopicAdminLog.loserId, id))
      .orderBy(desc(canonicalTopicAdminLog.createdAt))
      .limit(1);
    const meta = latestMergeRow[0]?.metadata as
      | { reassigned?: number[]; conflict_episode_ids?: number[] }
      | undefined;
    const reassignedIds = Array.isArray(meta?.reassigned)
      ? meta.reassigned
      : [];
    const conflictIds = Array.isArray(meta?.conflict_episode_ids)
      ? meta.conflict_episode_ids
      : [];
    const candidateIds = Array.from(
      new Set([...reassignedIds, ...conflictIds]),
    );
    if (candidateIds.length > 0) {
      const episodeRows = await db
        .select({ id: episodes.id, title: episodes.title })
        .from(episodes)
        .where(inArray(episodes.id, candidateIds));
      suggestedEpisodes = episodeRows;
    }
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

      {topic.status === "merged" && (
        <UnmergeDialogTrigger
          topic={topic}
          suggestedEpisodes={suggestedEpisodes}
        />
      )}

      <section>
        <h3 className="mb-2 font-medium">Aliases</h3>
        {aliases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No aliases.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {aliases.map((a) => (
              <li key={a.id}>{a.alias}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-medium">Recent Episodes (last 20)</h3>
        {recentJunctions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No episodes.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {recentJunctions.map((j) => (
              <li key={j.episodeId} className="text-muted-foreground">
                #{j.episodeId} — {j.episodeTitle}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-medium">Audit Log</h3>
        <AuditLogList rows={auditData.rows} />
      </section>
    </div>
  );
}
