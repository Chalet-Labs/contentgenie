import { sql, and, ilike, eq, count, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  canonicalTopics,
  canonicalTopicAdminLog,
  episodes,
  type CanonicalTopicKind,
  type CanonicalTopicStatus,
} from "@/db/schema";
import { canonicalTopicEpisodeCount } from "@/lib/admin/canonical-topic-episode-count";

export const TOPICS_PAGE_SIZE = 50;
export const AUDIT_LOG_PAGE_SIZE = 50;

export interface CanonicalTopicRow {
  id: number;
  label: string;
  kind: CanonicalTopicKind;
  status: CanonicalTopicStatus;
  episodeCount: number;
  lastSeen: Date;
  mergedIntoId: number | null;
}

export interface AdminAuditRow {
  id: number;
  actor: string;
  action: string;
  loserId: number;
  winnerId: number;
  metadata: unknown;
  createdAt: Date;
}

interface TopicsListFilters {
  search?: string | null;
  status?: string | null;
  kind?: string | null;
  page: number;
}

export async function getCanonicalTopicsListQuery(
  filters: TopicsListFilters,
): Promise<{ rows: CanonicalTopicRow[]; totalCount: number }> {
  const conditions = [];

  if (filters.search) {
    conditions.push(
      ilike(
        canonicalTopics.label,
        `%${filters.search.replace(/[%_\\]/g, "\\$&")}%`,
      ),
    );
  }
  if (filters.status) {
    conditions.push(
      eq(canonicalTopics.status, filters.status as CanonicalTopicStatus),
    );
  }
  if (filters.kind) {
    conditions.push(
      eq(canonicalTopics.kind, filters.kind as CanonicalTopicKind),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (filters.page - 1) * TOPICS_PAGE_SIZE;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: canonicalTopics.id,
        label: canonicalTopics.label,
        kind: canonicalTopics.kind,
        status: canonicalTopics.status,
        episodeCount: canonicalTopicEpisodeCount(),
        lastSeen: canonicalTopics.lastSeen,
        mergedIntoId: canonicalTopics.mergedIntoId,
      })
      .from(canonicalTopics)
      .where(where)
      .orderBy(desc(canonicalTopics.lastSeen))
      .limit(TOPICS_PAGE_SIZE)
      .offset(offset),
    db.select({ total: count() }).from(canonicalTopics).where(where),
  ]);

  return {
    rows,
    totalCount: countRows[0]?.total ?? 0,
  };
}

export async function getUnmergeSuggestionsQuery(
  loserId: number,
): Promise<{ id: number; title: string }[]> {
  const latestMergeRow = await db
    .select({ metadata: canonicalTopicAdminLog.metadata })
    .from(canonicalTopicAdminLog)
    .where(eq(canonicalTopicAdminLog.loserId, loserId))
    .orderBy(desc(canonicalTopicAdminLog.createdAt))
    .limit(1);

  const meta = latestMergeRow[0]?.metadata as
    | { reassigned?: number[]; conflict_episode_ids?: number[] }
    | undefined;
  const reassignedIds = Array.isArray(meta?.reassigned) ? meta.reassigned : [];
  const conflictIds = Array.isArray(meta?.conflict_episode_ids)
    ? meta.conflict_episode_ids
    : [];
  const candidateIds = Array.from(new Set([...reassignedIds, ...conflictIds]));

  if (candidateIds.length === 0) return [];

  return db
    .select({ id: episodes.id, title: episodes.title })
    .from(episodes)
    .where(inArray(episodes.id, candidateIds));
}

interface AuditLogFilters {
  canonicalId?: number | null;
  page: number;
}

export async function getAdminAuditLogQuery(
  filters: AuditLogFilters,
): Promise<{ rows: AdminAuditRow[]; totalCount: number }> {
  const offset = (filters.page - 1) * AUDIT_LOG_PAGE_SIZE;

  const where =
    filters.canonicalId != null
      ? sql`${canonicalTopicAdminLog.loserId} = ${filters.canonicalId} OR ${canonicalTopicAdminLog.winnerId} = ${filters.canonicalId}`
      : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: canonicalTopicAdminLog.id,
        actor: canonicalTopicAdminLog.actor,
        action: canonicalTopicAdminLog.action,
        loserId: canonicalTopicAdminLog.loserId,
        winnerId: canonicalTopicAdminLog.winnerId,
        metadata: canonicalTopicAdminLog.metadata,
        createdAt: canonicalTopicAdminLog.createdAt,
      })
      .from(canonicalTopicAdminLog)
      .where(where)
      .orderBy(desc(canonicalTopicAdminLog.createdAt))
      .limit(AUDIT_LOG_PAGE_SIZE)
      .offset(offset),
    db.select({ total: count() }).from(canonicalTopicAdminLog).where(where),
  ]);

  return {
    rows,
    totalCount: countRows[0]?.total ?? 0,
  };
}
