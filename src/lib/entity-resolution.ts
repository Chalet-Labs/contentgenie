import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { transactional } from "@/db/pool";
import { EMBEDDING_DIMENSION } from "@/lib/ai/embed-constants";
import { generateCompletion } from "@/lib/ai/generate";
import {
  AUTO_MATCH_SIMILARITY_THRESHOLD,
  DISAMBIG_MAX_TOKENS,
  DISAMBIG_TEMPERATURE,
  DISAMBIGUATE_SIMILARITY_THRESHOLD,
  EXACT_MATCH_SIMILARITY,
  HNSW_EF_SEARCH,
  KNN_DISAMBIG_CANDIDATE_POOL,
  OTHER_KIND_RELEVANCE_FLOOR,
  RECENT_EVENT_WINDOW_DAYS,
  VERSION_TOKEN_REGEX,
  type MatchMethod,
} from "@/lib/entity-resolution-constants";
import {
  parseJsonResponse,
  type NormalizedTopic,
  type TopicKind,
} from "@/lib/openrouter";
import { getEntityDisambiguatorPrompt } from "@/lib/prompts/entity-disambiguator";

/**
 * Per-topic resolver: converts a `NormalizedTopic` into either a junction row
 * pointing at an existing canonical or a freshly inserted canonical, using the
 * three-tier auto-match → LLM disambiguator → new-insert pipeline ratified by
 * ADR-042 + ADR-044.
 *
 * Server-only. Wraps Postgres-only work in `transactional()` from `@/db/pool`
 * with the LLM call between two transactions (ADR-044 two-phase pattern):
 * the advisory lock is never held across the LLM round-trip.
 */

export type ResolveTopicInput = NormalizedTopic & {
  episodeId: number;
  identityEmbedding: readonly number[];
  contextEmbedding: readonly number[];
};

interface ResolveTopicResultBase {
  canonicalId: number;
  aliasesAdded: number;
  candidatesConsidered: number;
}

export type ResolveTopicResult =
  | (ResolveTopicResultBase & {
      matchMethod: "auto";
      similarityToTopMatch: number;
      versionTokenForcedDisambig: false;
    })
  | (ResolveTopicResultBase & {
      matchMethod: "llm_disambig";
      similarityToTopMatch: number;
      versionTokenForcedDisambig: boolean;
    })
  | (ResolveTopicResultBase & {
      matchMethod: "new";
      similarityToTopMatch: null;
      versionTokenForcedDisambig: boolean;
    });

interface KnnCandidate {
  id: number;
  label: string;
  kind: TopicKind;
  summary: string;
  similarity: number;
}

interface PendingDisambig {
  pending: true;
  candidates: KnnCandidate[];
  versionTokenForcedDisambig: boolean;
}

export type Tx = {
  execute: (query: unknown) => Promise<{ rows: unknown[] }>;
};

// These constants are interpolated unquoted via `sql.raw(String(...))` into
// SQL (Postgres won't accept a parameterised setting for `SET LOCAL`, and
// `LIMIT` / `interval '... days'` need integer literals). Validate at module
// load that they're safe positive-integer literals so no user-controlled
// value can ever reach those sites.
for (const [name, value] of [
  ["HNSW_EF_SEARCH", HNSW_EF_SEARCH],
  ["RECENT_EVENT_WINDOW_DAYS", RECENT_EVENT_WINDOW_DAYS],
  ["KNN_DISAMBIG_CANDIDATE_POOL", KNN_DISAMBIG_CANDIDATE_POOL],
] as const) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer literal; got ${value}`);
  }
}

/**
 * Canonical-form helper used for the advisory-lock key, the
 * `normalized_label` column write, and the exact-lookup query — the three
 * places that MUST agree to avoid whitespace-variant races.
 */
export function normalizeLabel(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Build the advisory-lock key. JSON-encoding `[normalizedLabel, kind]`
 * makes the input structurally unambiguous: distinct (label, kind) pairs
 * cannot produce the same key even if a label happens to contain `|`,
 * brackets, or other separator candidates.
 */
export function buildLockKey(label: string, kind: TopicKind): string {
  return JSON.stringify([normalizeLabel(label), kind]);
}

// Pgvector wants a textual representation `'[v1,v2,...]'::vector`. Drizzle's
// `vector()` column type uses a custom encoder for `db.insert(...).values(...)`,
// but raw `sql\`${arr}::vector\`` interpolates a JS array as a record literal
// (`(v1, v2, ...)`), which Postgres can't cast. Format it as a single string
// here. Numbers are validated finite by `resolveTopic` before this is reached,
// so there's no SQL-injection surface — they're still bound as a single param.
export function formatVector(values: readonly number[]): string {
  return `[${values.join(",")}]`;
}

export type EntityResolutionReason =
  | "invalid_embedding_dim"
  | "invalid_embedding_value"
  | "other_below_relevance_floor"
  | "disambig_transport_failed"
  | "disambig_parse_failed"
  | "conflict_recovery_failed";

export class EntityResolutionError extends Error {
  readonly name = "EntityResolutionError" as const;
  /** True when the LLM disambiguator was called but a later step failed. */
  readonly usedDisambiguator: boolean;
  constructor(
    readonly reason: EntityResolutionReason,
    options?: { cause?: unknown; usedDisambiguator?: boolean },
  ) {
    super(reason, options);
    this.usedDisambiguator = options?.usedDisambiguator ?? false;
  }
}

export function validateResolveTopicInput(input: ResolveTopicInput): void {
  if (input.kind === "other" && input.relevance < OTHER_KIND_RELEVANCE_FLOOR) {
    throw new EntityResolutionError("other_below_relevance_floor");
  }
  if (
    input.identityEmbedding.length !== EMBEDDING_DIMENSION ||
    input.contextEmbedding.length !== EMBEDDING_DIMENSION
  ) {
    throw new EntityResolutionError("invalid_embedding_dim");
  }
  if (
    !input.identityEmbedding.every(Number.isFinite) ||
    !input.contextEmbedding.every(Number.isFinite)
  ) {
    throw new EntityResolutionError("invalid_embedding_value");
  }
}

export function hasVersionTokenMismatch(a: string, b: string): boolean {
  const tokensA = extractVersionTokens(a);
  const tokensB = extractVersionTokens(b);
  if (tokensA.size !== tokensB.size) return true;
  return Array.from(tokensA).some((t) => !tokensB.has(t));
}

function extractVersionTokens(label: string): Set<string> {
  const matches = Array.from(
    label.toLowerCase().matchAll(VERSION_TOKEN_REGEX),
    (m) => m[0],
  );
  return new Set(matches);
}

const disambigSchema = z.object({
  chosen_id: z.number().int().nullable(),
});

// ---- Tx helpers -------------------------------------------------------------

async function acquireLock(
  tx: Tx,
  label: string,
  kind: TopicKind,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${buildLockKey(label, kind)}, 0))`,
  );
}

async function exactLookup(
  tx: Tx,
  label: string,
  kind: TopicKind,
): Promise<{ id: number; kind: TopicKind } | null> {
  const result = await tx.execute(
    sql`SELECT id, kind FROM canonical_topics WHERE lower(normalized_label) = ${normalizeLabel(label)} AND kind = ${kind} AND status = 'active' LIMIT 1`,
  );
  const row = result.rows[0] as { id: number; kind: TopicKind } | undefined;
  return row ?? null;
}

async function setEfSearch(tx: Tx): Promise<void> {
  await tx.execute(
    sql`SET LOCAL hnsw.ef_search = ${sql.raw(String(HNSW_EF_SEARCH))}`,
  );
}

async function runKnn(
  tx: Tx,
  embedding: readonly number[],
): Promise<KnnCandidate[]> {
  const vec = formatVector(embedding);
  const result = await tx.execute(
    sql`SELECT id, label, kind, summary,
              1 - (identity_embedding <=> ${vec}::vector) AS similarity
       FROM canonical_topics
       WHERE status = 'active'
         AND (kind IN ('concept', 'work')
              OR last_seen > now() - interval '${sql.raw(String(RECENT_EVENT_WINDOW_DAYS))} days'
              OR ongoing = true)
       ORDER BY identity_embedding <=> ${vec}::vector
       LIMIT ${sql.raw(String(KNN_DISAMBIG_CANDIDATE_POOL))}`,
  );
  return result.rows as KnnCandidate[];
}

async function confirmCandidate(
  tx: Tx,
  chosenId: number,
  embedding: readonly number[],
): Promise<{ id: number; kind: TopicKind; similarity: number } | null> {
  const result = await tx.execute(
    sql`SELECT id, kind, 1 - (identity_embedding <=> ${formatVector(embedding)}::vector) AS similarity
       FROM canonical_topics WHERE id = ${chosenId} AND status = 'active' LIMIT 1`,
  );
  const row = result.rows[0] as
    | { id: number; kind: TopicKind; similarity: number }
    | undefined;
  return row ?? null;
}

export async function updateLastSeen(
  tx: Tx,
  canonicalId: number,
): Promise<void> {
  await tx.execute(
    sql`UPDATE canonical_topics SET last_seen = now() WHERE id = ${canonicalId}`,
  );
}

export async function upsertAliases(
  tx: Tx,
  canonicalId: number,
  aliases: readonly string[],
): Promise<number> {
  const valid = aliases.map((a) => a.trim()).filter((a) => a.length > 0);
  if (valid.length === 0) return 0;
  const values = sql.join(
    valid.map((alias) => sql`(${canonicalId}, ${alias})`),
    sql`, `,
  );
  const result = await tx.execute(
    sql`INSERT INTO canonical_topic_aliases (canonical_topic_id, alias)
       VALUES ${values}
       ON CONFLICT (canonical_topic_id, lower(alias)) DO NOTHING
       RETURNING id`,
  );
  return result.rows.length;
}

async function insertJunction(
  tx: Tx,
  args: {
    episodeId: number;
    canonicalId: number;
    matchMethod: MatchMethod;
    similarity: number | null;
    coverageScore: number;
  },
): Promise<void> {
  // ON CONFLICT DO NOTHING guards against duplicate-topic crashes when the
  // same episode references the same canonical twice (e.g. two normalized
  // topics that resolve to the same canonical via different paths).
  await tx.execute(
    sql`INSERT INTO episode_canonical_topics
         (episode_id, canonical_topic_id, match_method, similarity_to_top_match, coverage_score)
       VALUES (${args.episodeId}, ${args.canonicalId}, ${args.matchMethod}, ${args.similarity}, ${args.coverageScore})
       ON CONFLICT (episode_id, canonical_topic_id) DO NOTHING`,
  );
}

export async function insertCanonical(
  tx: Tx,
  input: ResolveTopicInput,
): Promise<number | null> {
  const result = await tx.execute(
    sql`INSERT INTO canonical_topics
         (label, normalized_label, kind, summary, ongoing, relevance,
          identity_embedding, context_embedding)
       VALUES (
         ${input.label},
         ${normalizeLabel(input.label)},
         ${input.kind},
         ${input.summary},
         ${input.ongoing},
         ${input.relevance},
         ${formatVector(input.identityEmbedding)}::vector,
         ${formatVector(input.contextEmbedding)}::vector
       )
       ON CONFLICT DO NOTHING
       RETURNING id`,
  );
  const row = result.rows[0] as { id: number } | undefined;
  return row?.id ?? null;
}

/**
 * Common write trio shared by every successful match path: update last_seen,
 * upsert aliases, write the junction row. Centralising this means a future
 * audit/log addition is a single-site change rather than six.
 */
async function finalizeMatch(
  tx: Tx,
  args: {
    input: ResolveTopicInput;
    canonicalId: number;
    matchMethod: MatchMethod;
    similarity: number | null;
  },
): Promise<number> {
  await updateLastSeen(tx, args.canonicalId);
  const aliasesAdded = await upsertAliases(
    tx,
    args.canonicalId,
    args.input.aliases,
  );
  await insertJunction(tx, {
    episodeId: args.input.episodeId,
    canonicalId: args.canonicalId,
    matchMethod: args.matchMethod,
    similarity: args.similarity,
    coverageScore: args.input.coverageScore,
  });
  return aliasesAdded;
}

// ---- Main entry point ------------------------------------------------------

export async function resolveTopic(
  input: ResolveTopicInput,
): Promise<ResolveTopicResult> {
  validateResolveTopicInput(input);

  const tx1Result = await transactional<ResolveTopicResult | PendingDisambig>(
    async (tx1) => runTx1(tx1 as unknown as Tx, input),
  );

  if (!("pending" in tx1Result)) {
    return tx1Result;
  }

  let chosenId: number | null;
  try {
    chosenId = await callDisambiguator(input, tx1Result.candidates);
  } catch (err) {
    if (
      err instanceof EntityResolutionError &&
      err.reason === "disambig_parse_failed"
    ) {
      throw new EntityResolutionError(err.reason, {
        cause: err,
        usedDisambiguator: true,
      });
    }
    throw err;
  }

  try {
    return await transactional<ResolveTopicResult>(async (tx2) =>
      runTx2(
        tx2 as unknown as Tx,
        input,
        tx1Result.candidates,
        chosenId,
        tx1Result.versionTokenForcedDisambig,
      ),
    );
  } catch (err) {
    if (err instanceof EntityResolutionError) {
      throw new EntityResolutionError(err.reason, {
        cause: err,
        usedDisambiguator: true,
      });
    }
    throw new EntityResolutionError("conflict_recovery_failed", {
      cause: err,
      usedDisambiguator: true,
    });
  }
}

async function runTx1(
  tx: Tx,
  input: ResolveTopicInput,
): Promise<ResolveTopicResult | PendingDisambig> {
  await acquireLock(tx, input.label, input.kind);

  const exact = await exactLookup(tx, input.label, input.kind);
  if (exact !== null) {
    const aliasesAdded = await finalizeMatch(tx, {
      input,
      canonicalId: exact.id,
      matchMethod: "auto",
      similarity: EXACT_MATCH_SIMILARITY,
    });
    return {
      canonicalId: exact.id,
      matchMethod: "auto",
      similarityToTopMatch: EXACT_MATCH_SIMILARITY,
      aliasesAdded,
      versionTokenForcedDisambig: false,
      candidatesConsidered: 0,
    };
  }

  await setEfSearch(tx);
  const candidates = await runKnn(tx, input.identityEmbedding);
  const top = candidates[0];
  const versionMismatch =
    top !== undefined && hasVersionTokenMismatch(input.label, top.label);

  if (
    top &&
    top.similarity > AUTO_MATCH_SIMILARITY_THRESHOLD &&
    top.kind === input.kind &&
    !versionMismatch
  ) {
    const aliasesAdded = await finalizeMatch(tx, {
      input,
      canonicalId: top.id,
      matchMethod: "auto",
      similarity: top.similarity,
    });
    return {
      canonicalId: top.id,
      matchMethod: "auto",
      similarityToTopMatch: top.similarity,
      aliasesAdded,
      versionTokenForcedDisambig: false,
      candidatesConsidered: candidates.length,
    };
  }

  const needsDisambig =
    versionMismatch ||
    candidates.some((c) => c.similarity >= DISAMBIGUATE_SIMILARITY_THRESHOLD);
  if (needsDisambig) {
    return {
      pending: true,
      candidates,
      versionTokenForcedDisambig: versionMismatch,
    };
  }

  // Pure new-insert
  const newId = await insertCanonical(tx, input);
  if (newId !== null) {
    const aliasesAdded = await finalizeMatch(tx, {
      input,
      canonicalId: newId,
      matchMethod: "new",
      similarity: null,
    });
    return {
      canonicalId: newId,
      matchMethod: "new",
      similarityToTopMatch: null,
      aliasesAdded,
      versionTokenForcedDisambig: false,
      candidatesConsidered: candidates.length,
    };
  }

  // Recovery on `INSERT ... ON CONFLICT DO NOTHING` returning 0 rows: use
  // exact-lookup, never another kNN. ADR-042 documents the 91–180 day window
  // where active event-type canonicals are excluded from kNN; recovering via
  // a second kNN would loop or duplicate. ADR-044 §4 is the durable record.
  const recovered = await exactLookup(tx, input.label, input.kind);
  if (recovered === null) {
    throw new EntityResolutionError("conflict_recovery_failed");
  }
  const aliasesAdded = await finalizeMatch(tx, {
    input,
    canonicalId: recovered.id,
    matchMethod: "auto",
    similarity: EXACT_MATCH_SIMILARITY,
  });
  return {
    canonicalId: recovered.id,
    matchMethod: "auto",
    similarityToTopMatch: EXACT_MATCH_SIMILARITY,
    aliasesAdded,
    versionTokenForcedDisambig: false,
    candidatesConsidered: candidates.length,
  };
}

async function callDisambiguator(
  input: ResolveTopicInput,
  candidates: KnnCandidate[],
): Promise<number | null> {
  const prompt = getEntityDisambiguatorPrompt(
    { label: input.label, kind: input.kind, summary: input.summary },
    candidates,
  );
  let raw: string;
  try {
    raw = await generateCompletion([{ role: "user", content: prompt }], {
      maxTokens: DISAMBIG_MAX_TOKENS,
      temperature: DISAMBIG_TEMPERATURE,
    });
  } catch (err) {
    throw new EntityResolutionError("disambig_transport_failed", {
      cause: err,
    });
  }
  try {
    const parsed = parseJsonResponse<unknown>(raw);
    return disambigSchema.parse(parsed).chosen_id;
  } catch (err) {
    throw new EntityResolutionError("disambig_parse_failed", { cause: err });
  }
}

async function runTx2(
  tx: Tx,
  input: ResolveTopicInput,
  candidates: KnnCandidate[],
  chosenId: number | null,
  versionTokenForcedDisambig: boolean,
): Promise<ResolveTopicResult> {
  await acquireLock(tx, input.label, input.kind);

  // Defer to anything another writer landed during the LLM round-trip.
  const exact = await exactLookup(tx, input.label, input.kind);
  if (exact !== null) {
    const aliasesAdded = await finalizeMatch(tx, {
      input,
      canonicalId: exact.id,
      matchMethod: "auto",
      similarity: EXACT_MATCH_SIMILARITY,
    });
    return {
      canonicalId: exact.id,
      matchMethod: "auto",
      similarityToTopMatch: EXACT_MATCH_SIMILARITY,
      aliasesAdded,
      versionTokenForcedDisambig: false,
      candidatesConsidered: candidates.length,
    };
  }

  const llmPickedExisting =
    chosenId !== null && candidates.some((c) => c.id === chosenId);
  if (llmPickedExisting) {
    const confirmed = await confirmCandidate(
      tx,
      chosenId,
      input.identityEmbedding,
    );
    if (confirmed && confirmed.kind === input.kind) {
      const aliasesAdded = await finalizeMatch(tx, {
        input,
        canonicalId: confirmed.id,
        matchMethod: "llm_disambig",
        similarity: confirmed.similarity,
      });
      return {
        canonicalId: confirmed.id,
        matchMethod: "llm_disambig",
        similarityToTopMatch: confirmed.similarity,
        aliasesAdded,
        versionTokenForcedDisambig,
        candidatesConsidered: candidates.length,
      };
    }
    // confirmed candidate gone or wrong kind: fall through to new-insert
  }

  const newId = await insertCanonical(tx, input);
  if (newId !== null) {
    const aliasesAdded = await finalizeMatch(tx, {
      input,
      canonicalId: newId,
      matchMethod: "new",
      similarity: null,
    });
    return {
      canonicalId: newId,
      matchMethod: "new",
      similarityToTopMatch: null,
      aliasesAdded,
      versionTokenForcedDisambig,
      candidatesConsidered: candidates.length,
    };
  }

  const recovered = await exactLookup(tx, input.label, input.kind);
  if (recovered === null) {
    throw new EntityResolutionError("conflict_recovery_failed");
  }
  const aliasesAdded = await finalizeMatch(tx, {
    input,
    canonicalId: recovered.id,
    matchMethod: "auto",
    similarity: EXACT_MATCH_SIMILARITY,
  });
  return {
    canonicalId: recovered.id,
    matchMethod: "auto",
    similarityToTopMatch: EXACT_MATCH_SIMILARITY,
    aliasesAdded,
    versionTokenForcedDisambig: false,
    candidatesConsidered: candidates.length,
  };
}
