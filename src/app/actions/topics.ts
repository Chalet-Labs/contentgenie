"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { tasks, auth as triggerAuth } from "@trigger.dev/sdk";

import { withAdminAction } from "@/lib/auth-wrapper";
import {
  mergeCanonicals,
  unmergeCanonicals,
  type MergeCanonicalsResult,
  type UnmergeCanonicalsResult,
} from "@/trigger/helpers/database";
import {
  getCanonicalTopicsListQuery,
  getAdminAuditLogQuery,
  getUnmergeSuggestionsQuery,
  getCanonicalMergeCleanupDriftQuery,
  type CanonicalTopicRow,
  type AdminAuditRow,
  type DriftRow,
} from "@/lib/admin/topic-queries";
import {
  canonicalTopicStatusEnum,
  canonicalTopicKindEnum,
  canonicalTopicAliases,
  canonicalTopics,
  canonicalTopicDigests,
  episodes,
  episodeCanonicalTopics,
  podcasts,
  listenHistory,
  userLibrary,
  IN_PROGRESS_STATUSES,
  type CanonicalTopicKind,
  type CanonicalTopicStatus,
  type SummaryStatus,
} from "@/db/schema";
import { db } from "@/db";
import type { ActionResult } from "@/types/action-result";
import type { summarizeEpisode } from "@/trigger/summarize-episode";
import type { generateTopicDigest } from "@/trigger/generate-topic-digest";
import type { PodcastIndexEpisodeId } from "@/types/ids";
import { withAuthAction } from "@/lib/auth-wrapper";
import {
  canonicalTopicEpisodeCount,
  canonicalTopicCompletedSummaryCount,
} from "@/lib/admin/canonical-topic-episode-count";
import {
  MIN_DERIVED_COUNT_FOR_DIGEST,
  RELATED_TOPICS_LIMIT,
  isDigestSynthesizable,
} from "@/lib/topic-digest-thresholds";
import { MAX_CONSENSUS_PREVIEW_CHARS } from "@/lib/topic-digest-preview";
import { formatVector } from "@/lib/entity-resolution";
import { coerceEmbedding } from "@/trigger/helpers/coerce-embedding";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const mergeSchema = z.object({
  loserId: z.number().int().positive(),
  winnerId: z.number().int().positive(),
});

const unmergeSchema = z.object({
  loserId: z.number().int().positive(),
  episodeIdsToReassign: z.array(z.number().int().positive()),
  // Default true: removing winner junction rows is the correct semantic for
  // unmerge (avoids silent duplicate episode attribution). See ADR-046 §7.
  alsoRemoveFromWinner: z.boolean().default(true),
});

const topicsListSchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    status: z.enum(canonicalTopicStatusEnum.enumValues).optional(),
    kind: z.enum(canonicalTopicKindEnum.enumValues).optional(),
    // T4: tri-state filter. "yes" | "no" | null → boolean in query layer.
    ongoing: z.boolean().optional(),
    episodeCountMin: z.number().int().min(0).optional(),
    episodeCountMax: z.number().int().min(0).optional(),
    page: z.number().int().min(1),
  })
  .strict()
  .refine(
    (d) =>
      d.episodeCountMin === undefined ||
      d.episodeCountMax === undefined ||
      d.episodeCountMin <= d.episodeCountMax,
    { message: "episodeCountMin must be ≤ episodeCountMax" },
  );

const auditLogSchema = z.object({
  canonicalId: z.number().int().positive().optional(),
  page: z.number().int().min(1),
});

const unmergeSuggestionsSchema = z.object({
  loserId: z.number().int().positive(),
});

const removeAliasSchema = z
  .object({
    canonicalId: z.number().int().positive(),
    aliasId: z.number().int().positive(),
  })
  .strict();

const bulkMergeSchema = z
  .object({
    loserIds: z
      .array(z.number().int().positive())
      .min(1, "loserIds must not be empty")
      .max(50, "Maximum 50 losers per bulk-merge call"),
    winnerId: z.number().int().positive(),
  })
  .strict()
  .refine((d) => !d.loserIds.includes(d.winnerId), {
    message: "winnerId must not be in loserIds",
  })
  .refine((d) => new Set(d.loserIds).size === d.loserIds.length, {
    message: "loserIds must not contain duplicates",
  });

const fullResummarizeSchema = z
  .object({
    episodeId: z.number().int().positive(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Shared domain-error set
// ---------------------------------------------------------------------------

// Domain errors thrown by the merge/unmerge helpers in src/trigger/helpers/database.ts.
// Anything else is treated as an unexpected failure and rethrown.
const MERGE_DOMAIN_ERRORS = new Set([
  "self-merge",
  "not-found",
  "not-active",
  "not-merged",
  "invariant-violated",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BulkMergeResultEntry =
  | { loserId: number; ok: true; data: MergeCanonicalsResult }
  | { loserId: number; ok: false; error: string };

export interface BulkMergeResult {
  succeeded: number;
  failed: number;
  results: BulkMergeResultEntry[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function adminMergeCanonicals(input: {
  loserId: number;
  winnerId: number;
}): Promise<ActionResult<MergeCanonicalsResult>> {
  return withAdminAction(async (userId) => {
    const parsed = mergeSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const { loserId, winnerId } = parsed.data;
    try {
      const data = await mergeCanonicals({ loserId, winnerId, actor: userId });
      revalidatePath("/admin/topics");
      revalidatePath(`/admin/topics/${loserId}`);
      revalidatePath(`/admin/topics/${winnerId}`);
      return { success: true, data };
    } catch (e) {
      if (e instanceof Error && MERGE_DOMAIN_ERRORS.has(e.message)) {
        return { success: false, error: e.message };
      }
      throw e;
    }
  });
}

export async function adminUnmergeCanonicals(input: {
  loserId: number;
  episodeIdsToReassign: number[];
  alsoRemoveFromWinner?: boolean;
}): Promise<ActionResult<UnmergeCanonicalsResult>> {
  return withAdminAction(async (userId) => {
    const parsed = unmergeSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const { loserId, episodeIdsToReassign, alsoRemoveFromWinner } = parsed.data;
    try {
      const data = await unmergeCanonicals({
        loserId,
        episodeIdsToReassign,
        alsoRemoveFromWinner,
        actor: userId,
      });
      revalidatePath("/admin/topics");
      revalidatePath(`/admin/topics/${loserId}`);
      revalidatePath(`/admin/topics/${data.previousWinnerId}`);
      return { success: true, data };
    } catch (e) {
      if (e instanceof Error && MERGE_DOMAIN_ERRORS.has(e.message)) {
        return { success: false, error: e.message };
      }
      throw e;
    }
  });
}

export async function getCanonicalTopicsList(input: {
  search?: string;
  status?: string;
  kind?: string;
  ongoing?: boolean;
  episodeCountMin?: number;
  episodeCountMax?: number;
  page: number;
}): Promise<ActionResult<{ rows: CanonicalTopicRow[]; totalCount: number }>> {
  return withAdminAction(async () => {
    const parsed = topicsListSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const data = await getCanonicalTopicsListQuery(parsed.data);
    return { success: true, data };
  });
}

export async function getUnmergeSuggestions(input: {
  loserId: number;
}): Promise<ActionResult<{ id: number; title: string }[]>> {
  return withAdminAction(async () => {
    const parsed = unmergeSuggestionsSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const data = await getUnmergeSuggestionsQuery(parsed.data.loserId);
    return { success: true, data };
  });
}

export async function getAdminAuditLog(input: {
  canonicalId?: number;
  page: number;
}): Promise<ActionResult<{ rows: AdminAuditRow[]; totalCount: number }>> {
  return withAdminAction(async () => {
    const parsed = auditLogSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const data = await getAdminAuditLogQuery(parsed.data);
    return { success: true, data };
  });
}

// ---------------------------------------------------------------------------
// T5: Remove a single alias
// ---------------------------------------------------------------------------

export async function removeAlias(input: {
  canonicalId: number;
  aliasId: number;
}): Promise<ActionResult<{ removed: number }>> {
  return withAdminAction(async () => {
    const parsed = removeAliasSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const { canonicalId, aliasId } = parsed.data;
    const deleted = await db
      .delete(canonicalTopicAliases)
      .where(
        and(
          eq(canonicalTopicAliases.id, aliasId),
          eq(canonicalTopicAliases.canonicalTopicId, canonicalId),
        ),
      )
      .returning({ id: canonicalTopicAliases.id });
    if (deleted.length === 0) {
      // Either the alias does not exist or the canonical/alias pair did not
      // match (defends against IDOR — we never reveal which). The consumer
      // gets a clean negative signal so the success toast does not lie.
      return { success: false, error: "not-found" };
    }
    revalidatePath(`/admin/topics/${canonicalId}`);
    return { success: true, data: { removed: deleted.length } };
  });
}

// ---------------------------------------------------------------------------
// T7: Sequential bulk-merge
//
// Per ADR-049 §3 and spec constraint: merges run serially to avoid racing on
// the winner's junction state. Max 50 losers per call to bound wall-clock time.
// ---------------------------------------------------------------------------

export async function bulkMergeCanonicals(input: {
  loserIds: number[];
  winnerId: number;
}): Promise<ActionResult<BulkMergeResult>> {
  return withAdminAction(async (userId) => {
    const parsed = bulkMergeSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const { winnerId, loserIds } = parsed.data;
    // Validation already rejected winner-in-losers AND duplicate loserIds.

    const results: BulkMergeResultEntry[] = [];
    for (const loserId of loserIds) {
      try {
        const data = await mergeCanonicals({
          loserId,
          winnerId,
          actor: userId,
        });
        results.push({ loserId, ok: true, data });
        revalidatePath(`/admin/topics/${loserId}`);
      } catch (e) {
        const error = e instanceof Error ? e.message : "unknown-error";
        // Per-loser isolation continues the loop, but log unexpected errors so
        // ops sees them — domain errors are expected and stay quiet.
        if (!(e instanceof Error) || !MERGE_DOMAIN_ERRORS.has(e.message)) {
          console.error("[bulkMergeCanonicals] unexpected per-loser failure:", {
            loserId,
            winnerId,
            error: e,
          });
        }
        results.push({ loserId, ok: false, error });
      }
    }

    revalidatePath("/admin/topics");
    revalidatePath(`/admin/topics/${winnerId}`);

    const succeeded = results.filter((r) => r.ok).length;
    return {
      success: true,
      data: { succeeded, failed: results.length - succeeded, results },
    };
  });
}

// ---------------------------------------------------------------------------
// T8a: Per-episode full re-summarize (ADR-049 §2)
//
// Thin wrapper around the existing summarize-episode task. No forceFull flag
// needed — the task always runs the full pipeline. Pattern matches
// src/app/api/admin/batch-resummarize/route.ts.
// ---------------------------------------------------------------------------

export async function triggerFullResummarize(input: {
  episodeId: number;
}): Promise<ActionResult<{ runId: string; episodeId: number }>> {
  return withAdminAction(async () => {
    const parsed = fullResummarizeSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const { episodeId } = parsed.data;

    const [episode] = await db
      .select({
        id: episodes.id,
        podcastIndexId: episodes.podcastIndexId,
        transcriptStatus: episodes.transcriptStatus,
        summaryStatus: episodes.summaryStatus,
      })
      .from(episodes)
      .where(eq(episodes.id, episodeId))
      .limit(1);

    if (!episode) {
      return { success: false, error: "not-found" };
    }
    if (episode.transcriptStatus !== "available") {
      return { success: false, error: "no-transcript" };
    }
    // Defence-in-depth: reject if already queued/running (matches batch-resummarize route).
    if (
      episode.summaryStatus !== null &&
      IN_PROGRESS_STATUSES.includes(episode.summaryStatus as SummaryStatus)
    ) {
      return { success: false, error: "already-busy" };
    }
    // Synthetic/RSS feeds use non-numeric podcastIndexIds (e.g. "rss-abc"),
    // and `Number("rss-abc")` is NaN. Mirror the batch-resummarize route's
    // guard before flipping summaryStatus → "queued" so we don't strand the
    // row on an impossible trigger payload.
    const numericPodcastIndexId = Number(episode.podcastIndexId);
    if (!Number.isFinite(numericPodcastIndexId) || numericPodcastIndexId <= 0) {
      return { success: false, error: "non-numeric-podcast-index-id" };
    }

    const prior = episode.summaryStatus;

    // Atomic CAS: only flip to "queued" if summaryStatus hasn't changed since
    // we read it — prevents two concurrent requests from both passing the
    // IN_PROGRESS check and enqueuing duplicate runs.
    const updated = await db
      .update(episodes)
      .set({ summaryStatus: "queued", updatedAt: new Date() })
      .where(
        and(
          eq(episodes.id, episodeId),
          prior === null
            ? isNull(episodes.summaryStatus)
            : eq(episodes.summaryStatus, prior),
        ),
      )
      .returning({ id: episodes.id });

    if (updated.length === 0) {
      return { success: false, error: "already-busy" };
    }

    try {
      const run = await tasks.trigger<typeof summarizeEpisode>(
        "summarize-episode",
        { episodeId: numericPodcastIndexId },
      );
      return { success: true, data: { runId: run.id, episodeId } };
    } catch (e) {
      console.error("[triggerFullResummarize] trigger failed:", {
        episodeId,
        error: e,
      });
      try {
        await db
          .update(episodes)
          .set({ summaryStatus: prior, updatedAt: new Date() })
          .where(eq(episodes.id, episodeId));
      } catch (revertErr) {
        console.error("[triggerFullResummarize] revert also failed:", {
          episodeId,
          triggerError: e,
          revertError: revertErr,
        });
      }
      return {
        success: false,
        error: e instanceof Error ? e.message : "trigger-failed",
      };
    }
  });
}

// ---------------------------------------------------------------------------
// T8b: Merge-cleanup drift surface (ADR-049 §1)
//
// Name kept as `getCanonicalEpisodeCountDrift` for issue-traceability (#391).
// The underlying semantics: merged canonicals with orphaned junction rows
// (merge-pipeline bug per the path-compression invariant from ADR-042
// and the DELETE-then-UPDATE mechanic in ADR-046 §2).
// ---------------------------------------------------------------------------

export async function getCanonicalEpisodeCountDrift(): Promise<
  ActionResult<DriftRow[]>
> {
  return withAdminAction(async () => {
    const data = await getCanonicalMergeCleanupDriftQuery();
    return { success: true, data };
  });
}

// ---------------------------------------------------------------------------
// triggerTopicDigestGeneration — user-facing digest trigger (ADR-051)
// ---------------------------------------------------------------------------

const topicDigestSchema = z
  .object({ canonicalTopicId: z.number().int().positive() })
  .strict();

type TopicDigestGenerationResult = ActionResult<{
  status: "queued" | "cached" | "ineligible";
  digestId?: number;
  runId?: string;
}>;

// Unwrapped helper (no `withAuthAction`) so callers run the Clerk lookup
// exactly once per public action invocation — see issue #452.
async function triggerTopicDigestGenerationCore(
  input: z.infer<typeof topicDigestSchema>,
): Promise<TopicDigestGenerationResult> {
  const { canonicalTopicId } = input;

  const [canonicalRows, digestRows] = await Promise.all([
    db
      .select({
        id: canonicalTopics.id,
        status: canonicalTopics.status,
        completedSummaryCount: canonicalTopicCompletedSummaryCount(),
      })
      .from(canonicalTopics)
      .where(eq(canonicalTopics.id, canonicalTopicId)),
    db
      .select({
        id: canonicalTopicDigests.id,
        episodeCountAtGeneration:
          canonicalTopicDigests.episodeCountAtGeneration,
      })
      .from(canonicalTopicDigests)
      .where(eq(canonicalTopicDigests.canonicalTopicId, canonicalTopicId)),
  ]);

  const canonical = canonicalRows[0];
  if (!canonical || canonical.status !== "active") {
    return { success: false, error: "not-found" };
  }

  // Both eligibility and staleness operate on completed-summary count to
  // align with the task's `summaryStatus = 'completed'` predicate (ADR-051).
  // The `isDigestSynthesizable` predicate is the canonical implementation;
  // the action just maps its boolean result back to our three-state
  // {ineligible, cached, queued} response by inspecting the inputs once
  // more to disambiguate which negative branch fired.
  const completedSummaryCount = Number(canonical.completedSummaryCount ?? 0);
  const existing = digestRows[0] ?? null;
  const synthesizable = isDigestSynthesizable({
    completedSummaryCount,
    digestEpisodeCountAtGeneration: existing?.episodeCountAtGeneration ?? null,
  });

  if (!synthesizable) {
    if (completedSummaryCount < MIN_DERIVED_COUNT_FOR_DIGEST) {
      return {
        success: true,
        data: { status: "ineligible", digestId: existing?.id },
      };
    }
    // Above the minimum but not stale enough — serve the cached digest.
    if (!existing) {
      throw new Error("invariant violated: cached status but no digest row");
    }
    return {
      success: true,
      data: { status: "cached", digestId: existing.id },
    };
  }

  try {
    const handle = await tasks.trigger<typeof generateTopicDigest>(
      "generate-topic-digest",
      { canonicalTopicId },
      {
        idempotencyKey: `generate-topic-digest-${canonicalTopicId}`,
        idempotencyKeyTTL: "10m",
      },
    );
    return {
      success: true,
      data: { status: "queued", digestId: existing?.id, runId: handle.id },
    };
  } catch (e) {
    console.error("[triggerTopicDigestGenerationCore] trigger failed:", {
      canonicalTopicId,
      error: e,
    });
    return {
      success: false,
      error: e instanceof Error ? e.message : "trigger-failed",
    };
  }
}

export async function triggerTopicDigestGeneration(input: {
  canonicalTopicId: number;
}): Promise<TopicDigestGenerationResult> {
  return withAuthAction(async () => {
    const parsed = topicDigestSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    return triggerTopicDigestGenerationCore(parsed.data);
  });
}

// ---------------------------------------------------------------------------
// getTopicDetailData — public-facing topic detail page payload
// ---------------------------------------------------------------------------
//
// Returns canonical row, digest (if any), episode list (joined with the
// caller's listen-history + library), and 5 nearest related canonicals. Action
// returns `not-found` for both missing rows and `status === "merged"` rows;
// the page is responsible for following the merge chain before calling here.

export type TopicDetailCanonical = {
  id: number;
  label: string;
  kind: CanonicalTopicKind;
  status: Exclude<CanonicalTopicStatus, "merged">;
  summary: string;
  episodeCount: number;
  completedSummaryCount: number;
};

export type TopicEpisode = {
  id: number;
  podcastIndexEpisodeId: PodcastIndexEpisodeId;
  title: string;
  podcastTitle: string;
  podcastFeedId: string;
  coverageScore: number;
  isListened: boolean;
  isSaved: boolean;
};

export type RelatedTopic = {
  id: number;
  label: string;
  kind: CanonicalTopicKind;
};

export type TopicDigest = {
  id: number;
  digestMarkdown: string;
  consensusPoints: string[];
  disagreementPoints: string[];
  episodeCountAtGeneration: number;
  modelUsed: string;
  generatedAt: Date;
};

export type TopicDetailData = {
  canonical: TopicDetailCanonical;
  digest: TopicDigest | null;
  episodes: TopicEpisode[];
  relatedTopics: RelatedTopic[];
};

const topicDetailDataSchema = z
  .object({
    canonicalTopicId: z.number().int().positive(),
    showOnlyUnheard: z.boolean().optional(),
  })
  .strict();

export async function getTopicDetailData(input: {
  canonicalTopicId: number;
  showOnlyUnheard?: boolean;
}): Promise<ActionResult<TopicDetailData>> {
  return withAuthAction(async (userId) => {
    const parsed = topicDetailDataSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    const { canonicalTopicId, showOnlyUnheard = false } = parsed.data;

    const canonicalRows = await db
      .select({
        id: canonicalTopics.id,
        label: canonicalTopics.label,
        kind: canonicalTopics.kind,
        status: canonicalTopics.status,
        summary: canonicalTopics.summary,
        identityEmbedding: canonicalTopics.identityEmbedding,
        episodeCount: canonicalTopicEpisodeCount(),
        completedSummaryCount: canonicalTopicCompletedSummaryCount(),
      })
      .from(canonicalTopics)
      .where(eq(canonicalTopics.id, canonicalTopicId));

    const canonical = canonicalRows[0];
    if (!canonical || canonical.status === "merged") {
      // Page is responsible for the redirect — action treats merged as not-found.
      return { success: false, error: "not-found" };
    }

    const episodeWhere = showOnlyUnheard
      ? and(
          eq(episodeCanonicalTopics.canonicalTopicId, canonicalTopicId),
          isNull(listenHistory.id),
        )
      : eq(episodeCanonicalTopics.canonicalTopicId, canonicalTopicId);

    const [digestRows, episodeRows] = await Promise.all([
      db
        .select({
          id: canonicalTopicDigests.id,
          digestMarkdown: canonicalTopicDigests.digestMarkdown,
          consensusPoints: canonicalTopicDigests.consensusPoints,
          disagreementPoints: canonicalTopicDigests.disagreementPoints,
          episodeCountAtGeneration:
            canonicalTopicDigests.episodeCountAtGeneration,
          modelUsed: canonicalTopicDigests.modelUsed,
          generatedAt: canonicalTopicDigests.generatedAt,
        })
        .from(canonicalTopicDigests)
        .where(eq(canonicalTopicDigests.canonicalTopicId, canonicalTopicId)),
      db
        .select({
          id: episodes.id,
          podcastIndexEpisodeId: episodes.podcastIndexId,
          title: episodes.title,
          podcastTitle: podcasts.title,
          podcastFeedId: podcasts.podcastIndexId,
          coverageScore: episodeCanonicalTopics.coverageScore,
          listenId: listenHistory.id,
          libraryId: userLibrary.id,
        })
        .from(episodeCanonicalTopics)
        .innerJoin(episodes, eq(episodeCanonicalTopics.episodeId, episodes.id))
        .innerJoin(podcasts, eq(episodes.podcastId, podcasts.id))
        .leftJoin(
          listenHistory,
          and(
            eq(listenHistory.episodeId, episodes.id),
            eq(listenHistory.userId, userId),
            isNotNull(listenHistory.completedAt),
          ),
        )
        .leftJoin(
          userLibrary,
          and(
            eq(userLibrary.episodeId, episodes.id),
            eq(userLibrary.userId, userId),
          ),
        )
        .where(episodeWhere)
        .orderBy(
          desc(episodeCanonicalTopics.coverageScore),
          desc(episodeCanonicalTopics.createdAt),
        ),
    ]);

    const embedding = coerceEmbedding(canonical.identityEmbedding);
    let relatedRows: {
      id: number;
      label: string;
      kind: string;
    }[] = [];
    if (embedding) {
      try {
        const vec = formatVector(embedding);
        const result = await db.execute(
          sql`SELECT id, label, kind, 1 - (identity_embedding <=> ${vec}::vector) AS similarity
              FROM canonical_topics
              WHERE id <> ${canonicalTopicId}
                AND status = 'active'
                AND identity_embedding IS NOT NULL
              ORDER BY identity_embedding <=> ${vec}::vector
              LIMIT ${RELATED_TOPICS_LIMIT}`,
        );
        relatedRows = result.rows as typeof relatedRows;
      } catch (error) {
        console.error("[getTopicDetailData] related-topics kNN failed", {
          canonicalTopicId,
          error,
        });
        relatedRows = [];
      }
    }

    const { identityEmbedding: _ignored, ...canonicalOut } = canonical;
    const digestRow = digestRows[0] ?? null;

    return {
      success: true,
      data: {
        canonical: canonicalOut as TopicDetailCanonical,
        digest: digestRow,
        episodes: episodeRows.map((row) => ({
          id: row.id,
          podcastIndexEpisodeId: row.podcastIndexEpisodeId,
          title: row.title,
          podcastTitle: row.podcastTitle,
          podcastFeedId: row.podcastFeedId,
          coverageScore: row.coverageScore,
          isListened: row.listenId !== null,
          isSaved: row.libraryId !== null,
        })),
        relatedTopics: relatedRows.map((row) => ({
          id: row.id,
          label: row.label,
          kind: row.kind as CanonicalTopicKind,
        })),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// triggerTopicDigestRefresh — gate-delegating wrapper that bundles a
// publicAccessToken so the client can subscribe via useRealtimeRun without
// a separate roundtrip (ADR-053).
// ---------------------------------------------------------------------------

export async function triggerTopicDigestRefresh(input: {
  canonicalTopicId: number;
}): Promise<
  ActionResult<{
    status: "queued" | "cached" | "ineligible";
    digestId?: number;
    runId?: string;
    publicAccessToken?: string;
  }>
> {
  return withAuthAction(async () => {
    const parsed = topicDigestSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const gateResult = await triggerTopicDigestGenerationCore(parsed.data);
    if (!gateResult.success) return gateResult;

    const { status, digestId, runId } = gateResult.data;
    if (status !== "queued" || !runId) {
      return { success: true, data: { status, digestId } };
    }

    try {
      const publicAccessToken = await triggerAuth.createPublicToken({
        scopes: { read: { runs: [runId] } },
        expirationTime: "15m",
      });
      return {
        success: true,
        data: { status, digestId, runId, publicAccessToken },
      };
    } catch (e) {
      console.error("[triggerTopicDigestRefresh] token creation failed:", {
        runId,
        error: e,
      });
      return { success: false, error: "token-failed" };
    }
  });
}

// ---------------------------------------------------------------------------
// getRecentTopicDigests — dashboard "this week's takes" section
// ---------------------------------------------------------------------------

const getRecentTopicDigestsSchema = z
  .object({
    limit: z.number().int().min(1).max(20).default(5),
  })
  .strict();

function truncateConsensus(points: string[]): string {
  const first = points[0] ?? "";
  const chars = Array.from(first);
  if (chars.length <= MAX_CONSENSUS_PREVIEW_CHARS) return first;
  return chars.slice(0, MAX_CONSENSUS_PREVIEW_CHARS).join("") + "…";
}

export type RecentTopicDigest = {
  canonicalId: number;
  label: string;
  kind: CanonicalTopicKind;
  episodeCount: number;
  generatedAt: Date;
  consensusPreview: string;
};

export async function getRecentTopicDigests(input?: {
  limit?: number;
}): Promise<ActionResult<RecentTopicDigest[]>> {
  return withAuthAction(async (_userId) => {
    const parsed = getRecentTopicDigestsSchema.safeParse(input ?? {});
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      // Two-pass: fetch the digest rows + canonical metadata first, then
      // fetch episode counts in a separate single-table query. The
      // `canonicalTopicEpisodeCount()` helper is safe in single-table
      // `from(canonicalTopics)` queries; in any multi-table query Drizzle
      // emits a double-qualified `"canonical_topics"."canonical_topics"."id"`
      // reference that Postgres rejects with 42P01 errorMissingRTE.
      const digestRows = await db
        .select({
          canonicalId: canonicalTopics.id,
          label: canonicalTopics.label,
          kind: canonicalTopics.kind,
          generatedAt: canonicalTopicDigests.generatedAt,
          consensusPoints: canonicalTopicDigests.consensusPoints,
        })
        .from(canonicalTopics)
        .innerJoin(
          canonicalTopicDigests,
          eq(canonicalTopicDigests.canonicalTopicId, canonicalTopics.id),
        )
        .where(
          and(
            eq(canonicalTopics.status, "active"),
            gte(canonicalTopicDigests.generatedAt, sevenDaysAgo),
          ),
        )
        .orderBy(desc(canonicalTopicDigests.generatedAt))
        .limit(parsed.data.limit);

      // Deduplicate: keep the most recent digest per topic (rows are already
      // ordered by desc generatedAt, so the first occurrence per topic wins).
      const seen = new Set<number>();
      const uniqueDigestRows = digestRows.filter((r) => {
        if (seen.has(r.canonicalId)) return false;
        seen.add(r.canonicalId);
        return true;
      });

      // Pass 2: episode counts via the helper, single-table FROM only.
      const canonicalIds = uniqueDigestRows.map((r) => r.canonicalId);
      const episodeCountById = new Map<number, number>();
      if (canonicalIds.length > 0) {
        const countRows = await db
          .select({
            id: canonicalTopics.id,
            episodeCount: canonicalTopicEpisodeCount(),
          })
          .from(canonicalTopics)
          .where(inArray(canonicalTopics.id, canonicalIds));
        for (const r of countRows) {
          episodeCountById.set(r.id, Number(r.episodeCount ?? 0));
        }
      }

      return {
        success: true,
        data: uniqueDigestRows.map((r) => ({
          canonicalId: r.canonicalId,
          label: r.label,
          kind: r.kind,
          episodeCount: episodeCountById.get(r.canonicalId) ?? 0,
          generatedAt: r.generatedAt,
          consensusPreview: truncateConsensus(
            (r.consensusPoints as string[] | null) ?? [],
          ),
        })),
      };
    } catch (err) {
      // Convert DB exceptions into a soft failure so the dashboard
      // <Suspense> boundary doesn't escape the whole page. The component
      // already handles `success: false` by returning null.
      console.error("[getRecentTopicDigests] DB query failed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "db-query-failed",
      };
    }
  });
}
