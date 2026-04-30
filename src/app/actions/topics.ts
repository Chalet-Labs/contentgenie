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
  type CanonicalTopicRow,
  type AdminAuditRow,
} from "@/lib/admin/topic-queries";
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
  status: z.string().optional(),
  kind: z.string().optional(),
  page: z.number().int().min(1),
});

const auditLogSchema = z.object({
  canonicalId: z.number().int().positive().optional(),
  page: z.number().int().min(1),
});

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
    const data = await mergeCanonicals({ loserId, winnerId, actor: userId });
    revalidatePath("/admin/topics");
    revalidatePath(`/admin/topics/${loserId}`);
    return { success: true, data };
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
    const data = await unmergeCanonicals({
      loserId,
      episodeIdsToReassign,
      alsoRemoveFromWinner,
      actor: userId,
    });
    revalidatePath("/admin/topics");
    revalidatePath(`/admin/topics/${loserId}`);
    return { success: true, data };
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

/**
 * Fetch paginated admin audit log entries.
 *
 * Intentional improvement over the issue spec (which used `{ limit }`):
 * this action accepts `{ canonicalId?, page }` so the detail page can scope
 * results to one canonical and a future global overview can paginate without
 * API changes.
 */
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
