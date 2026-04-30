import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  canonicalTopics,
  canonicalTopicAliases,
  episodeCanonicalTopics,
  episodes,
} from "@/db/schema";
import {
  getAdminAuditLogQuery,
  getUnmergeSuggestionsQuery,
} from "@/lib/admin/topic-queries";
import { AuditLogList } from "@/components/admin/topics/audit-log-list";
import {
  walkMergedChain,
  TOPIC_DISPLAY_COLUMNS,
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

  const suggestedEpisodes =
    topic.status === "merged" ? await getUnmergeSuggestionsQuery(id) : [];

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
