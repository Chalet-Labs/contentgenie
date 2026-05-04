"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { tasks } from "@trigger.dev/sdk";

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
  IN_PROGRESS_STATUSES,
  type SummaryStatus,
} from "@/db/schema";
import { db } from "@/db";
import type { ActionResult } from "@/types/action-result";
import type { summarizeEpisode } from "@/trigger/summarize-episode";
import type { generateTopicDigest } from "@/trigger/generate-topic-digest";
import { withAuthAction } from "@/lib/auth-wrapper";
import { canonicalTopicCompletedSummaryCount } from "@/lib/admin/canonical-topic-episode-count";
import {
  MIN_DERIVED_COUNT_FOR_DIGEST,
  STALENESS_GROWTH_THRESHOLD,
} from "@/lib/topic-digest-thresholds";

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

export async function triggerTopicDigestGeneration(input: {
  canonicalTopicId: number;
}): Promise<
  ActionResult<{
    status: "queued" | "cached" | "ineligible";
    digestId?: number;
    runId?: string;
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
    const { canonicalTopicId } = parsed.data;

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
    // align with the task's `summaryStatus = 'completed'` predicate. Using the
    // raw linked-episode count would let the action queue runs that the task
    // then aborts (false-positive 'queued') and miss regenerations when new
    // summaries complete without new links being added.
    const completedSummaryCount = canonical.completedSummaryCount;
    const existing = digestRows[0] ?? null;

    if (completedSummaryCount < MIN_DERIVED_COUNT_FOR_DIGEST) {
      return {
        success: true,
        data: { status: "ineligible", digestId: existing?.id },
      };
    }

    if (
      existing &&
      Math.abs(completedSummaryCount - existing.episodeCountAtGeneration) <
        STALENESS_GROWTH_THRESHOLD
    ) {
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
      console.error("[triggerTopicDigestGeneration] trigger failed:", {
        canonicalTopicId,
        error: e,
      });
      return {
        success: false,
        error: e instanceof Error ? e.message : "trigger-failed",
      };
    }
  });
}
