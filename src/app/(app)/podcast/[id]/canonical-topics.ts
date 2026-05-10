import { inArray, lte, sql, eq, and } from "drizzle-orm";
import { db } from "@/db";
import {
  episodeCanonicalTopics,
  canonicalTopics,
  canonicalTopicDigests,
} from "@/db/schema";
import type { CanonicalTopicChip } from "@/db/library-columns";
import { CANONICAL_TOPICS_PER_EPISODE } from "@/lib/episodes/topic-display";
import type { PodcastIndexEpisodeId } from "@/types/ids";
import { canonicalTopicEpisodeCount } from "@/lib/admin/canonical-topic-episode-count";
import { STALENESS_GROWTH_THRESHOLD } from "@/lib/topic-digest-thresholds";

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

    // Window-function rank on the junction. We deliberately keep this query
    // free of `canonicalTopicEpisodeCount()` and the digest leftJoin —
    // the helper requires `canonicalTopics` to be the primary FROM, but here
    // the primary FROM is `episode_canonical_topics`. Chip metadata
    // (`episodeCount`, `synthesizable`) is post-enriched in a second query
    // below, mirroring the `getUserLibrary` pattern.
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

    // Post-enrichment: fetch chip metadata (episodeCount + digest-staleness)
    // via TWO single-table queries (NOT one query with leftJoin) to avoid the
    // `canonicalTopicEpisodeCount()` helper bug — Drizzle emits a
    // double-qualified `"canonical_topics"."canonical_topics"."id"` reference
    // inside the correlated subquery whenever canonical_topics is referenced
    // from a multi-table query, raising Postgres 42P01. Mirrors topics.ts /
    // library.ts post-enrichment.
    const chipMeta = new Map<
      number,
      { episodeCount: number; digestEpisodeCountAtGeneration: number | null }
    >();
    const allChipIds = Array.from(new Set(rows.map((r) => r.topicId)));
    if (allChipIds.length > 0) {
      try {
        const [countRows, digestRows] = await Promise.all([
          db
            .select({
              id: canonicalTopics.id,
              episodeCount: canonicalTopicEpisodeCount(),
            })
            .from(canonicalTopics)
            .where(inArray(canonicalTopics.id, allChipIds)),
          db
            .select({
              id: canonicalTopicDigests.canonicalTopicId,
              episodeCountAtGeneration:
                canonicalTopicDigests.episodeCountAtGeneration,
            })
            .from(canonicalTopicDigests)
            .where(inArray(canonicalTopicDigests.canonicalTopicId, allChipIds)),
        ]);
        const digestById = new Map<number, number>();
        for (const d of digestRows) {
          digestById.set(d.id, d.episodeCountAtGeneration);
        }
        for (const r of countRows) {
          chipMeta.set(r.id, {
            episodeCount: Number(r.episodeCount ?? 0),
            digestEpisodeCountAtGeneration: digestById.get(r.id) ?? null,
          });
        }
      } catch (err) {
        console.error(
          "[podcast] chip metadata enrichment failed (chips render without synthesize CTA)",
          err,
        );
        // Degraded UX: chips render without episodeCount/synthesizable; CTA absent.
      }
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
        const digestExists = meta.digestEpisodeCountAtGeneration !== null;
        chip.episodeCount = meta.episodeCount;
        chip.synthesizable =
          !digestExists ||
          meta.episodeCount - (meta.digestEpisodeCountAtGeneration ?? 0) >=
            STALENESS_GROWTH_THRESHOLD;
      }
      (out[pi] ??= []).push(chip);
    }
    return out;
  } catch (err) {
    console.error("[podcast] getCanonicalTopicsByPodcastIndexId failed", err);
    return {};
  }
}
