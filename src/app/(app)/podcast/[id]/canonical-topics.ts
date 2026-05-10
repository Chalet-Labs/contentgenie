import { inArray, lte, sql, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { episodeCanonicalTopics, canonicalTopics } from "@/db/schema";
import type { CanonicalTopicChip } from "@/db/library-columns";
import { CANONICAL_TOPICS_PER_EPISODE } from "@/lib/episodes/topic-display";
import type { PodcastIndexEpisodeId } from "@/types/ids";
import { fetchChipMetadata } from "@/lib/canonical-topic-chip-metadata";
import { isDigestSynthesizable } from "@/lib/topic-digest-thresholds";

/**
 * Single JOIN + window-function rank (avoids N+1).
 * Returns `{}` on DB failure so a transient outage doesn't crash the page.
 */
export async function getCanonicalTopicsByPodcastIndexId(
  dbEpisodes: { id: number; podcastIndexId: PodcastIndexEpisodeId }[],
): Promise<Record<PodcastIndexEpisodeId, CanonicalTopicChip[]>> {
  if (dbEpisodes.length === 0) return {};
  try {
    const episodeIds = dbEpisodes.map((e) => e.id);
    const idToPodcastIndexId = new Map(
      dbEpisodes.map((e) => [e.id, e.podcastIndexId] as const),
    );

    // Window-function rank on the junction. Chip-metadata enrichment
    // (synthesizable flag) happens via `fetchChipMetadata` below.
    const sub = db
      .select({
        episodeId: episodeCanonicalTopics.episodeId,
        topicId: canonicalTopics.id,
        label: canonicalTopics.label,
        kind: canonicalTopics.kind,
        status: canonicalTopics.status,
        rn: sql<number>`
          row_number() over (
            partition by ${episodeCanonicalTopics.episodeId}
            order by ${episodeCanonicalTopics.coverageScore} desc, ${canonicalTopics.id} asc
          )
        `.as("rn"),
      })
      .from(episodeCanonicalTopics)
      .innerJoin(
        canonicalTopics,
        eq(episodeCanonicalTopics.canonicalTopicId, canonicalTopics.id),
      )
      .where(
        and(
          inArray(episodeCanonicalTopics.episodeId, episodeIds),
          eq(canonicalTopics.status, "active"),
        ),
      )
      .as("sub");

    const rows = await db
      .select({
        episodeId: sub.episodeId,
        topicId: sub.topicId,
        label: sub.label,
        kind: sub.kind,
        status: sub.status,
      })
      .from(sub)
      .where(lte(sub.rn, CANONICAL_TOPICS_PER_EPISODE))
      .orderBy(sub.episodeId, sub.rn);

    const allChipIds = Array.from(new Set(rows.map((r) => r.topicId)));
    let chipMeta: Awaited<ReturnType<typeof fetchChipMetadata>> = new Map();
    try {
      chipMeta = await fetchChipMetadata(allChipIds);
    } catch (err) {
      console.error(
        "[podcast] chip metadata enrichment failed (chips render without synthesize CTA)",
        err,
      );
      // Degraded UX: chips render without synthesizable; CTA absent.
    }

    const out = {} as Record<PodcastIndexEpisodeId, CanonicalTopicChip[]>;
    for (const row of rows) {
      const pi = idToPodcastIndexId.get(row.episodeId);
      if (!pi) continue;
      const meta = chipMeta.get(row.topicId);
      const chip: CanonicalTopicChip = {
        id: row.topicId,
        label: row.label,
        kind: row.kind,
        status: row.status,
      };
      if (meta) {
        chip.synthesizable = isDigestSynthesizable(meta);
      }
      (out[pi] ??= []).push(chip);
    }
    return out;
  } catch (err) {
    console.error("[podcast] getCanonicalTopicsByPodcastIndexId failed", err);
    return {};
  }
}
