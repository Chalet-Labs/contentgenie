import { eq } from "drizzle-orm";
import { db } from "@/db";
import { canonicalTopics } from "@/db/schema";

export const MAX_MERGE_DEPTH = 16;

export type CanonicalTopicSummary = Pick<
  typeof canonicalTopics.$inferSelect,
  | "id"
  | "label"
  | "kind"
  | "status"
  | "summary"
  | "episodeCount"
  | "mergedIntoId"
>;

export type WalkerError = "cycle" | "depth" | "null_pointer" | "broken_chain";
export type WalkerResult =
  | { terminal: CanonicalTopicSummary }
  | { error: WalkerError };

export const TOPIC_DISPLAY_COLUMNS = {
  id: true,
  label: true,
  kind: true,
  status: true,
  summary: true,
  episodeCount: true,
  mergedIntoId: true,
} as const;

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

    const next = await db.query.canonicalTopics.findFirst({
      columns: TOPIC_DISPLAY_COLUMNS,
      where: eq(canonicalTopics.id, nextId),
    });

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
