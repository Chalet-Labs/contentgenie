"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

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
  type CanonicalTopicRow,
  type AdminAuditRow,
} from "@/lib/admin/topic-queries";
import { canonicalTopicStatusEnum, canonicalTopicKindEnum } from "@/db/schema";
import type { ActionResult } from "@/types/action-result";

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

const topicsListSchema = z.object({
  search: z.string().optional(),
  status: z.enum(canonicalTopicStatusEnum.enumValues).optional(),
  kind: z.enum(canonicalTopicKindEnum.enumValues).optional(),
  page: z.number().int().min(1),
});

const auditLogSchema = z.object({
  canonicalId: z.number().int().positive().optional(),
  page: z.number().int().min(1),
});

const unmergeSuggestionsSchema = z.object({
  loserId: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Actions
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
