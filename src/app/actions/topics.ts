"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
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
  episodes,
} from "@/db/schema";
import { db } from "@/db";
import type { ActionResult } from "@/types/action-result";
import type { summarizeEpisode } from "@/trigger/summarize-episode";

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
    search: z.string().optional(),
    status: z.enum(canonicalTopicStatusEnum.enumValues).optional(),
    kind: z.enum(canonicalTopicKindEnum.enumValues).optional(),
    // T4: tri-state filter. "yes" | "no" | null → boolean in query layer.
    ongoing: z.boolean().optional(),
    episodeCountMin: z.number().int().min(0).optional(),
    episodeCountMax: z.number().int().min(0).optional(),
    page: z.number().int().min(1),
  })
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

const removeAliasSchema = z.object({
  canonicalId: z.number().int().positive(),
  aliasId: z.number().int().positive(),
});

const bulkMergeSchema = z
  .object({
    loserIds: z
      .array(z.number().int().positive())
      .min(1, "loserIds must not be empty")
      .max(50, "Maximum 50 losers per bulk-merge call"),
    winnerId: z.number().int().positive(),
  })
  .refine((d) => !d.loserIds.includes(d.winnerId), {
    message: "winnerId must not be in loserIds",
  });

const fullResummarizeSchema = z.object({
  episodeId: z.number().int().positive(),
});

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
    const { winnerId } = parsed.data;
    // Dedup while preserving order; validation already rejected winner-in-losers.
    const uniqueLoserIds = Array.from(new Set(parsed.data.loserIds));

    const results: BulkMergeResultEntry[] = [];
    for (const loserId of uniqueLoserIds) {
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
      episode.summaryStatus === "queued" ||
      episode.summaryStatus === "running" ||
      episode.summaryStatus === "summarizing"
    ) {
      return { success: false, error: "already-busy" };
    }

    await db
      .update(episodes)
      .set({ summaryStatus: "queued", updatedAt: new Date() })
      .where(eq(episodes.id, episodeId));

    try {
      const run = await tasks.trigger<typeof summarizeEpisode>(
        "summarize-episode",
        { episodeId: Number(episode.podcastIndexId) },
      );
      return { success: true, data: { runId: run.id, episodeId } };
    } catch (e) {
      try {
        await db
          .update(episodes)
          .set({ summaryStatus: null, updatedAt: new Date() })
          .where(eq(episodes.id, episodeId));
      } catch (revertErr) {
        console.error(
          "Failed to revert summaryStatus after trigger failure:",
          revertErr,
        );
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
// (merge-pipeline bug per ADR-046 §3 path-compression invariant).
// ---------------------------------------------------------------------------

export async function getCanonicalEpisodeCountDrift(): Promise<
  ActionResult<DriftRow[]>
> {
  return withAdminAction(async () => {
    const data = await getCanonicalMergeCleanupDriftQuery();
    return { success: true, data };
  });
}
