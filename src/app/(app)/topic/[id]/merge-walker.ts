import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { canonicalTopics, episodeCanonicalTopics } from "@/db/schema";

export const MAX_MERGE_DEPTH = 16;

type BaseTopicColumns = Pick<
  typeof canonicalTopics.$inferSelect,
  "id" | "label" | "kind" | "status" | "summary" | "mergedIntoId"
>;

export type CanonicalTopicSummary = BaseTopicColumns & {
  episodeCount: number;
};

export type WalkerError = "cycle" | "depth" | "null_pointer" | "broken_chain";
export type WalkerResult =
  | { terminal: CanonicalTopicSummary }
  | { error: WalkerError };

const topicSummarySelector = {
  id: canonicalTopics.id,
  label: canonicalTopics.label,
  kind: canonicalTopics.kind,
  status: canonicalTopics.status,
  summary: canonicalTopics.summary,
  episodeCount:
    sql<number>`(SELECT COUNT(*)::int FROM ${episodeCanonicalTopics} ect WHERE ect.canonical_topic_id = ${canonicalTopics}.${canonicalTopics.id})`.as(
      "episode_count",
    ),
  mergedIntoId: canonicalTopics.mergedIntoId,
} as const;

export async function findTopicSummary(
  id: number,
): Promise<CanonicalTopicSummary | null> {
  const [row] = await db
    .select(topicSummarySelector)
    .from(canonicalTopics)
    .where(eq(canonicalTopics.id, id))
    .limit(1);
  return row ?? null;
}

export async function walkMergedChain(
  start: CanonicalTopicSummary,
): Promise<WalkerResult> {
  const seen = new Set<number>();
  let current = start;
  let depth = 0;

  while (current.status === "merged") {
    if (depth >= MAX_MERGE_DEPTH) {
      console.error("[topic] merge depth exceeded", {
        startId: start.id,
        currentId: current.id,
        depth,
      });
      return { error: "depth" };
    }

    if (seen.has(current.id)) {
      console.error("[topic] merge cycle detected", {
        startId: start.id,
        cycleAtId: current.id,
        seen: Array.from(seen),
      });
      return { error: "cycle" };
    }

    seen.add(current.id);

    const nextId = current.mergedIntoId;
    if (!nextId) {
      console.error("[topic] merged topic has null mergedIntoId", {
        id: current.id,
      });
      return { error: "null_pointer" };
    }

    const next = await findTopicSummary(nextId);

    if (!next) {
      console.error("[topic] merge chain broken — target not found", {
        from: current.id,
        to: nextId,
      });
      return { error: "broken_chain" };
    }

    depth++;
    current = next;
  }

  return { terminal: current };
}
