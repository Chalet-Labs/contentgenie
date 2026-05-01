import { eq, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { db } from "@/db";
import { episodes, episodeTopics, podcasts } from "@/db/schema";
import type * as schema from "@/db/schema";
import { upsertPodcast } from "@/db/helpers";
import { asPodcastIndexEpisodeId } from "@/types/ids";
import type { SummaryResult } from "@/lib/openrouter";
import type {
  PodcastIndexPodcast,
  PodcastIndexEpisode,
} from "@/lib/podcastindex";
import {
  buildLockKey,
  EntityResolutionError,
  exactLookup,
  insertCanonical,
  insertJunction,
  updateLastSeen,
  upsertAliases,
  validateResolveTopicInput,
  type ResolveTopicInput,
  type ResolveTopicResult,
  type Tx,
} from "@/lib/entity-resolution";
import { EXACT_MATCH_SIMILARITY } from "@/lib/entity-resolution-constants";
import { transactional } from "@/db/pool";
import { ADMIN_LOG_ACTIONS } from "@/db/canonical-topic-admin-log-constants";

/**
 * Ensures a podcast exists in the database, creating it if necessary.
 * Delegates to the shared upsertPodcast helper when podcast data is available.
 */
async function ensurePodcast(
  feedId: number,
  podcast?: PodcastIndexPodcast,
): Promise<number | null> {
  if (podcast) {
    const categoryValues = podcast.categories
      ? Object.values(podcast.categories)
      : [];
    const categories = categoryValues.length > 0 ? categoryValues : undefined;

    return upsertPodcast(
      {
        podcastIndexId: feedId.toString(),
        title: podcast.title,
        description: podcast.description,
        publisher: podcast.author || podcast.ownerName,
        imageUrl: podcast.artwork || podcast.image,
        rssFeedUrl: podcast.url,
        categories,
        totalEpisodes: podcast.episodeCount,
        latestEpisodeDate: podcast.newestItemPubdate
          ? new Date(podcast.newestItemPubdate * 1000)
          : undefined,
      },
      { updateOnConflict: "full" },
    );
  }

  const dbPodcast = await db.query.podcasts.findFirst({
    where: eq(podcasts.podcastIndexId, feedId.toString()),
  });
  return dbPodcast?.id ?? null;
}

/**
 * Creates or updates an episode stub with run tracking info so the
 * GET endpoint can discover in-progress runs on page refresh.
 */
export async function trackEpisodeRun(
  episode: PodcastIndexEpisode,
  podcast: PodcastIndexPodcast | undefined,
  runId: string,
): Promise<void> {
  const podcastId = await ensurePodcast(episode.feedId, podcast);
  if (!podcastId) return;

  // PodcastIndex API id (number|string) → branded string.
  const piId = asPodcastIndexEpisodeId(episode.id.toString());

  const existingEp = await db.query.episodes.findFirst({
    where: eq(episodes.podcastIndexId, piId),
  });

  if (existingEp) {
    await db
      .update(episodes)
      .set({
        summaryRunId: runId,
        summaryStatus: "running",
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(episodes.id, existingEp.id));
  } else {
    await db
      .insert(episodes)
      .values({
        podcastId,
        podcastIndexId: piId,
        title: episode.title,
        description: episode.description,
        audioUrl: episode.enclosureUrl,
        duration: episode.duration,
        publishDate: episode.datePublished
          ? new Date(episode.datePublished * 1000)
          : null,
        summaryRunId: runId,
        summaryStatus: "running",
      })
      .onConflictDoNothing({ target: episodes.podcastIndexId });
  }
}

/**
 * Updates the episode's summaryStatus to "summarizing".
 * Non-critical — callers should wrap in try/catch.
 */
export async function updateEpisodeStatus(
  episodeId: number | string,
  status: "summarizing",
): Promise<void> {
  // PodcastIndex API id (number|string from caller) → branded string for DB lookup.
  const piId = asPodcastIndexEpisodeId(String(episodeId));
  await db
    .update(episodes)
    .set({
      summaryStatus: status,
      processingError: null,
      updatedAt: new Date(),
    })
    .where(eq(episodes.podcastIndexId, piId));
}

// persistTranscript is the sole writer of transcript columns — summarize-episode
// no longer touches them (ADR-027). Called by fetch-transcript after fetching
// from an external source (not on cache-hit paths where source is undefined).
// See ADR-026 for column ownership and ADR-027 for the refactor that removed
// transcript writes from persistEpisodeSummary.
export async function persistTranscript(
  episodeId: number,
  transcript: string,
  source: "podcastindex" | "assemblyai" | "description-url",
): Promise<void> {
  const now = new Date();
  // Trigger payload uses numeric form; brand for DB lookup.
  const piId = asPodcastIndexEpisodeId(String(episodeId));
  const updated = await db
    .update(episodes)
    .set({
      transcription: transcript,
      transcriptSource: source,
      transcriptStatus: "available",
      transcriptFetchedAt: now,
      transcriptError: null,
      transcriptRunId: null,
      updatedAt: now,
    })
    .where(eq(episodes.podcastIndexId, piId))
    .returning({ id: episodes.id });

  if (updated.length === 0) {
    throw new Error(
      `Episode ${episodeId} not found for transcript persistence`,
    );
  }
}

/**
 * Over-budget insert path: lock + exact-lookup + insert + junction.
 * Mirrors TX-1's new-insert tail without the kNN (ADR-045 §2).
 */
export async function forceInsertNewCanonical(
  input: ResolveTopicInput,
): Promise<ResolveTopicResult> {
  validateResolveTopicInput(input);

  return transactional(async (tx) => {
    const rawTx = tx as unknown as Tx;

    await rawTx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${buildLockKey(input.label, input.kind)}, 0))`,
    );

    const exact = await exactLookup(rawTx, input.label, input.kind);
    if (exact !== null) {
      await updateLastSeen(rawTx, exact.id);
      const aliasesAdded = await upsertAliases(rawTx, exact.id, input.aliases);
      await insertJunction(rawTx, {
        episodeId: input.episodeId,
        canonicalId: exact.id,
        matchMethod: "auto",
        similarity: EXACT_MATCH_SIMILARITY,
        coverageScore: input.coverageScore,
      });
      return {
        canonicalId: exact.id,
        matchMethod: "auto" as const,
        similarityToTopMatch: EXACT_MATCH_SIMILARITY,
        aliasesAdded,
        versionTokenForcedDisambig: false as const,
        candidatesConsidered: 0,
      };
    }

    let canonicalId = await insertCanonical(rawTx, input);
    let isRecovery = false;
    if (canonicalId === null) {
      isRecovery = true;
      canonicalId =
        (await exactLookup(rawTx, input.label, input.kind))?.id ?? null;
      if (canonicalId === null) {
        throw new EntityResolutionError("conflict_recovery_failed");
      }
    }

    await updateLastSeen(rawTx, canonicalId);
    const aliasesAdded = await upsertAliases(rawTx, canonicalId, input.aliases);

    if (isRecovery) {
      await insertJunction(rawTx, {
        episodeId: input.episodeId,
        canonicalId,
        matchMethod: "auto",
        similarity: EXACT_MATCH_SIMILARITY,
        coverageScore: input.coverageScore,
      });
      return {
        canonicalId,
        matchMethod: "auto" as const,
        similarityToTopMatch: EXACT_MATCH_SIMILARITY,
        aliasesAdded,
        versionTokenForcedDisambig: false as const,
        candidatesConsidered: 0,
      };
    }

    await insertJunction(rawTx, {
      episodeId: input.episodeId,
      canonicalId,
      matchMethod: "new",
      similarity: null,
      coverageScore: input.coverageScore,
    });

    return {
      canonicalId,
      matchMethod: "new" as const,
      similarityToTopMatch: null,
      aliasesAdded,
      versionTokenForcedDisambig: false as const,
      candidatesConsidered: 0,
    };
  });
}

/**
 * Inserts a single alias for an existing canonical topic.
 * Returns true if a row was created, false on conflict or blank input.
 */
export async function addAliasIfNew(
  canonicalId: number,
  alias: string,
): Promise<boolean> {
  const trimmed = alias.trim();
  if (!trimmed) return false;

  return transactional(async (tx) => {
    const rawTx = tx as unknown as Tx;
    const result = await rawTx.execute(
      sql`INSERT INTO canonical_topic_aliases (canonical_topic_id, alias)
           VALUES (${canonicalId}, ${trimmed})
           ON CONFLICT (canonical_topic_id, lower(alias)) DO NOTHING
           RETURNING id`,
    );
    return result.rows.length > 0;
  });
}

async function persistCategories(
  episodeId: number,
  categories: SummaryResult["categories"],
): Promise<void> {
  if (!categories || categories.length === 0) return;
  // Delete-then-insert to reconcile stale categories on re-summarization.
  // No transaction — benign failure mode matches the existing pattern
  // (summary saved without categories; Trigger.dev retries self-heal).
  // Note: the table is still called `episode_topics` for now (the rename
  // there belongs to A2/#383 — schema work).
  await db.delete(episodeTopics).where(eq(episodeTopics.episodeId, episodeId));
  await db.insert(episodeTopics).values(
    categories.map((c) => ({
      episodeId,
      topic: c.name,
      relevance: c.relevance.toFixed(2),
    })),
  );
}

export async function persistEpisodeSummary(
  episode: PodcastIndexEpisode,
  podcast: PodcastIndexPodcast | undefined,
  summary: SummaryResult,
): Promise<void> {
  const podcastId = await ensurePodcast(episode.feedId, podcast);
  if (!podcastId) {
    throw new Error("Could not find or create podcast in database");
  }

  // PodcastIndex API id (number|string) → branded string.
  const piId = asPodcastIndexEpisodeId(episode.id.toString());

  // May have been created by trackEpisodeRun
  const existingEpisode = await db.query.episodes.findFirst({
    where: eq(episodes.podcastIndexId, piId),
  });

  if (existingEpisode) {
    await db
      .update(episodes)
      .set({
        summary: summary.summary,
        keyTakeaways: summary.keyTakeaways,
        worthItScore: summary.worthItScore.toFixed(2),
        worthItReason: summary.worthItReason,
        worthItDimensions: summary.worthItDimensions ?? null,
        processedAt: new Date(),
        summaryStatus: "completed",
        summaryRunId: null,
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(episodes.id, existingEpisode.id));

    await persistCategories(existingEpisode.id, summary.categories);
  } else {
    const [inserted] = await db
      .insert(episodes)
      .values({
        podcastId,
        podcastIndexId: piId,
        title: episode.title,
        description: episode.description,
        audioUrl: episode.enclosureUrl,
        duration: episode.duration,
        publishDate: episode.datePublished
          ? new Date(episode.datePublished * 1000)
          : null,
        summary: summary.summary,
        keyTakeaways: summary.keyTakeaways,
        worthItScore: summary.worthItScore.toFixed(2),
        worthItReason: summary.worthItReason,
        worthItDimensions: summary.worthItDimensions ?? null,
        summaryStatus: "completed",
        processedAt: new Date(),
      })
      .returning({ id: episodes.id });

    if (inserted) {
      await persistCategories(inserted.id, summary.categories);
    }
  }
}

// ============================================================================
// Admin merge / unmerge helpers  (ADR-046)
// ============================================================================

type MergeCanonicalsArgs = {
  loserId: number;
  winnerId: number;
  actor: string;
};

export type MergeCanonicalsResult = {
  loserId: number;
  winnerId: number;
  episodesReassigned: number;
  conflictsDropped: number;
  aliasesCopied: number;
  newWinnerEpisodeCount: number;
};

type UnmergeCanonicalsArgs = {
  loserId: number;
  episodeIdsToReassign: number[];
  actor: string;
  alsoRemoveFromWinner?: boolean;
};

export type UnmergeCanonicalsResult = {
  loserId: number;
  previousWinnerId: number;
  episodesReassigned: number;
  episodesSkipped: number;
  episodesRemovedFromWinner: number;
};

/** Build the sorted-pair advisory-lock key for a (loser, winner) canonical pair. */
function buildMergeLockKey(a: number, b: number): string {
  return JSON.stringify([Math.min(a, b), Math.max(a, b)]);
}

/**
 * Merge `loserId` into `winnerId` inside a single transaction.
 *
 * Junction rewrite uses two sequential statements (ADR-046 §2):
 *   Step 4a — DELETE conflicts first (captures conflict_episode_ids for audit)
 *   Step 4b — UPDATE survivors (safe after conflicts are gone)
 * A single combined CTE would be incorrect: Postgres CTE snapshot semantics
 * mean the UPDATE arm would still see the rows being deleted and hit the
 * unique index.
 */
export function mergeCanonicals(
  args: MergeCanonicalsArgs,
  options?: { tx?: NeonDatabase<typeof schema> },
): Promise<MergeCanonicalsResult> {
  const { loserId, winnerId, actor } = args;

  return transactional(async (tx) => {
    // 1. Guard against self-merge (would violate ct_no_self_merge CHECK).
    if (loserId === winnerId) throw new Error("self-merge");

    // 2. Advisory lock on sorted pair
    const lockKey = buildMergeLockKey(loserId, winnerId);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );

    // 3. Preflight — confirm both exist, loser is active
    const preflight = await tx.execute<{
      id: number;
      status: string;
      episode_count: number;
    }>(
      sql`SELECT id, status, episode_count FROM canonical_topics WHERE id IN (${loserId}, ${winnerId}) FOR UPDATE`,
    );
    const loserRow = preflight.rows.find((r) => r.id === loserId);
    const winnerRow = preflight.rows.find((r) => r.id === winnerId);
    if (!loserRow || !winnerRow) throw new Error("not-found");
    if (loserRow.status !== "active") throw new Error("not-active");
    const loserEpisodeCount = loserRow.episode_count ?? 0;

    // 4a. DELETE conflicts — loser rows whose (episode, winner) pair already exists.
    //     Captures the dropped episode_ids for the audit metadata.
    //     ORDER IS LOAD-BEARING: must run before 4b.
    const deleteResult = await tx.execute<{ episode_id: number }>(
      sql`DELETE FROM episode_canonical_topics
           WHERE canonical_topic_id = ${loserId}
             AND episode_id IN (
               SELECT episode_id FROM episode_canonical_topics
                WHERE canonical_topic_id = ${winnerId}
             )
         RETURNING episode_id`,
    );
    const conflictEpisodeIds = deleteResult.rows.map((r) => r.episode_id);
    const conflictsDropped = deleteResult.rows.length;

    // 4b. Re-point survivors to the winner. Safe — no (episode, winner) collision possible now.
    const updateJunctionResult = await tx.execute<{ episode_id: number }>(
      sql`UPDATE episode_canonical_topics
             SET canonical_topic_id = ${winnerId}
           WHERE canonical_topic_id = ${loserId}
         RETURNING episode_id`,
    );
    const episodesReassigned = updateJunctionResult.rows.length;

    // 5. Atomic biconditional UPDATE: sets status='merged', merged_into_id=$winnerId,
    //    and zeroes loser episode_count in one statement (junctions just moved away,
    //    so the count is now zero by definition). Single statement satisfies the
    //    ct_merged_biconditional CHECK.
    await tx.execute(
      sql`UPDATE canonical_topics
             SET status = 'merged', merged_into_id = ${winnerId}, episode_count = 0
           WHERE id = ${loserId} AND status = 'active'`,
    );

    // 6. Alias copy: loser's label + all its aliases become winner aliases.
    const aliasInsertResult = await tx.execute(
      sql`INSERT INTO canonical_topic_aliases (canonical_topic_id, alias)
            SELECT ${winnerId}::integer, alias FROM canonical_topic_aliases WHERE canonical_topic_id = ${loserId}
            UNION
            SELECT ${winnerId}::integer, label FROM canonical_topics WHERE id = ${loserId}
          ON CONFLICT (canonical_topic_id, lower(alias)) DO NOTHING
          RETURNING alias`,
    );
    const aliasesCopied = aliasInsertResult.rows.length;

    // 7. Recompute winner episode_count from live junction.
    const countResult = await tx.execute<{ episode_count: number }>(
      sql`UPDATE canonical_topics
             SET episode_count = (
               SELECT count(*) FROM episode_canonical_topics
                WHERE canonical_topic_id = ${winnerId}
             )
           WHERE id = ${winnerId}
         RETURNING episode_count`,
    );
    const newWinnerEpisodeCount = countResult.rows[0]?.episode_count ?? 0;

    // 8. Audit log insert.
    const reassignedEpisodeIds = updateJunctionResult.rows.map(
      (r) => r.episode_id,
    );
    const metadata = JSON.stringify({
      episode_count_loser: loserEpisodeCount,
      conflicts_dropped: conflictsDropped,
      conflict_episode_ids: conflictEpisodeIds,
      reassigned: reassignedEpisodeIds,
    });
    await tx.execute(
      sql`INSERT INTO canonical_topic_admin_log (actor, action, loser_id, winner_id, metadata)
          VALUES (${actor}, ${ADMIN_LOG_ACTIONS.merge}, ${loserId}, ${winnerId}, ${metadata}::jsonb)`,
    );

    return {
      loserId,
      winnerId,
      episodesReassigned,
      conflictsDropped,
      aliasesCopied,
      newWinnerEpisodeCount,
    };
  }, options);
}

/**
 * Reverse a merge: revive `loserId` to 'active' and re-assign the supplied
 * episode IDs back to it.
 *
 * Lock ordering (ADR-046 §4) — must match mergeCanonicals (advisory → row) to
 * avoid deadlocks on concurrent merge/unmerge of the same pair:
 *   1. Non-locking probe of (status, merged_into_id) to discover previousWinnerId
 *   2. Acquire sorted-pair advisory lock (matches mergeCanonicals order)
 *   3. Re-read FOR UPDATE and re-validate — closes the race window where a
 *      concurrent merge-chain may have moved merged_into_id between probe and lock
 *   4. Atomic UPDATE reversing status + merged_into_id
 */
export function unmergeCanonicals(
  args: UnmergeCanonicalsArgs,
  options?: { tx?: NeonDatabase<typeof schema> },
): Promise<UnmergeCanonicalsResult> {
  const {
    loserId,
    episodeIdsToReassign,
    actor,
    alsoRemoveFromWinner = true,
  } = args;

  return transactional(async (tx) => {
    // 1. Non-locking probe to discover previousWinnerId.
    const probeResult = await tx.execute<{
      status: string;
      merged_into_id: number | null;
    }>(
      sql`SELECT status, merged_into_id FROM canonical_topics WHERE id = ${loserId}`,
    );
    const probe = probeResult.rows[0];
    if (!probe || probe.status !== "merged") throw new Error("not-merged");
    const previousWinnerId = probe.merged_into_id;
    if (previousWinnerId == null) throw new Error("invariant-violated");

    // 2. Advisory lock FIRST (matches mergeCanonicals order — no inversion).
    const lockKey = buildMergeLockKey(loserId, previousWinnerId);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );

    // 3. Re-read FOR UPDATE and re-validate. A concurrent merge chain may have
    //    re-merged the loser into a different winner between the probe and the
    //    lock; the advisory lock we hold is for the wrong pair in that case.
    const preflightResult = await tx.execute<{
      id: number;
      status: string;
      merged_into_id: number | null;
    }>(
      sql`SELECT id, status, merged_into_id FROM canonical_topics WHERE id = ${loserId} FOR UPDATE`,
    );
    const row = preflightResult.rows[0];
    if (!row || row.status !== "merged") throw new Error("not-merged");
    if (row.merged_into_id !== previousWinnerId) throw new Error("not-merged");

    // 4. Atomic reverse UPDATE.
    await tx.execute(
      sql`UPDATE canonical_topics
             SET status = 'active', merged_into_id = NULL
           WHERE id = ${loserId} AND status = 'merged'`,
    );

    // 5. Re-assign requested episodes to the loser in one set-based INSERT.
    //    Uses unnest() to expand the array of IDs into rows, LEFT JOINs the
    //    previous winner's junction to copy coverage_score (0.5 fallback),
    //    and ON CONFLICT DO NOTHING handles rows already attached to the loser.
    let episodesReassigned = 0;
    if (episodeIdsToReassign.length > 0) {
      const insertResult = await tx.execute<{ id: number }>(
        sql`INSERT INTO episode_canonical_topics
              (episode_id, canonical_topic_id, match_method, similarity_to_top_match, coverage_score)
            SELECT
              ids.episode_id::integer,
              ${loserId}::integer,
              'auto',
              1.0,
              COALESCE(prev.coverage_score, 0.5)
            FROM unnest(ARRAY[${sql.join(
              episodeIdsToReassign.map((id) => sql`${id}`),
              sql`, `,
            )}]::int[]) AS ids(episode_id)
            LEFT JOIN episode_canonical_topics prev
              ON prev.canonical_topic_id = ${previousWinnerId}
             AND prev.episode_id = ids.episode_id
            ON CONFLICT (episode_id, canonical_topic_id) DO NOTHING
            RETURNING id`,
      );
      episodesReassigned = insertResult.rows.length;
    }
    const episodesSkipped = episodeIdsToReassign.length - episodesReassigned;

    // 6. Remove winner's junction rows (default true — avoids silent duplicate attribution).
    let episodesRemovedFromWinner = 0;
    if (alsoRemoveFromWinner && episodeIdsToReassign.length > 0) {
      const deleteResult = await tx.execute<{ id: number }>(
        sql`DELETE FROM episode_canonical_topics
             WHERE canonical_topic_id = ${previousWinnerId}
               AND episode_id = ANY(ARRAY[${sql.join(
                 episodeIdsToReassign.map((id) => sql`${id}`),
                 sql`, `,
               )}]::int[])
             RETURNING id`,
      );
      episodesRemovedFromWinner = deleteResult.rows.length;
    }

    // 7. Recompute episode_count on both loser and winner from live junction.
    await tx.execute(
      sql`UPDATE canonical_topics
             SET episode_count = (
               SELECT count(*) FROM episode_canonical_topics
                WHERE canonical_topic_id = ${loserId}
             )
           WHERE id = ${loserId}
         RETURNING episode_count`,
    );
    await tx.execute(
      sql`UPDATE canonical_topics
             SET episode_count = (
               SELECT count(*) FROM episode_canonical_topics
                WHERE canonical_topic_id = ${previousWinnerId}
             )
           WHERE id = ${previousWinnerId}
         RETURNING episode_count`,
    );

    // 8. Audit log.
    const metadata = JSON.stringify({
      episode_ids: episodeIdsToReassign,
      reassigned: episodesReassigned,
      skipped: episodesSkipped,
      also_removed_from_winner: alsoRemoveFromWinner,
    });
    await tx.execute(
      sql`INSERT INTO canonical_topic_admin_log (actor, action, loser_id, winner_id, metadata)
          VALUES (${actor}, ${ADMIN_LOG_ACTIONS.unmerge}, ${loserId}, ${previousWinnerId}, ${metadata}::jsonb)`,
    );

    return {
      loserId,
      previousWinnerId,
      episodesReassigned,
      episodesSkipped,
      episodesRemovedFromWinner,
    };
  }, options);
}
