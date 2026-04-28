import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { transactional } from "@/db/pool";
import { EMBEDDING_DIMENSION } from "@/lib/ai/embed-constants";
import { generateCompletion } from "@/lib/ai/generate";
import {
  AUTO_MATCH_SIMILARITY_THRESHOLD,
  DISAMBIGUATE_SIMILARITY_THRESHOLD,
  HNSW_EF_SEARCH,
  KNN_DISAMBIG_CANDIDATE_POOL,
  RECENT_EVENT_WINDOW_DAYS,
  VERSION_TOKEN_REGEX,
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
  identityEmbedding: number[];
  contextEmbedding: number[];
};

export interface ResolveTopicResult {
  canonicalId: number;
  matchMethod: "auto" | "llm_disambig" | "new";
  similarityToTopMatch: number | null;
  aliasesAdded: number;
  versionTokenForcedDisambig: boolean;
  candidatesConsidered: number;
}

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

type Tx = {
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

// Pgvector wants a textual representation `'[v1,v2,...]'::vector`. Drizzle's
// `vector()` column type uses a custom encoder for `db.insert(...).values(...)`,
// but raw `sql\`${arr}::vector\`` interpolates a JS array as a record literal
// (`(v1, v2, ...)`), which Postgres can't cast. Format it as a single string
// here. Numbers come from `generateEmbedding` (pre-validated finite floats),
// so there's no SQL-injection surface — they're still bound as a single param.
function formatVector(values: readonly number[]): string {
  return `[${values.join(",")}]`;
}

export class EntityResolutionError extends Error {
  readonly name = "EntityResolutionError" as const;
  readonly reason: string;
  constructor(reason: string, options?: { cause?: unknown }) {
    super(reason, options);
    this.reason = reason;
  }
}

export function hasVersionTokenMismatch(a: string, b: string): boolean {
  const tokensA = extractVersionTokens(a);
  const tokensB = extractVersionTokens(b);
  if (tokensA.size !== tokensB.size) return true;
  return Array.from(tokensA).some((t) => !tokensB.has(t));
}

function extractVersionTokens(label: string): Set<string> {
  const re = new RegExp(VERSION_TOKEN_REGEX.source, VERSION_TOKEN_REGEX.flags);
  const matches = Array.from(label.toLowerCase().matchAll(re), (m) => m[0]);
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
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${normalizeLabel(label)} || '|' || ${kind}, 0))`,
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

async function runKnn(tx: Tx, embedding: number[]): Promise<KnnCandidate[]> {
  const result = await tx.execute(
    sql`SELECT id, label, kind, summary,
              1 - (identity_embedding <=> ${formatVector(embedding)}::vector) AS similarity
       FROM canonical_topics
       WHERE status = 'active'
         AND (kind IN ('concept', 'work')
              OR last_seen > now() - interval '${sql.raw(String(RECENT_EVENT_WINDOW_DAYS))} days'
              OR ongoing = true)
       ORDER BY identity_embedding <=> ${formatVector(embedding)}::vector
       LIMIT ${sql.raw(String(KNN_DISAMBIG_CANDIDATE_POOL))}`,
  );
  return result.rows.map((row) => {
    const r = row as {
      id: number;
      label: string;
      kind: TopicKind;
      summary: string;
      similarity: number;
    };
    return {
      id: r.id,
      label: r.label,
      kind: r.kind,
      summary: r.summary,
      similarity: r.similarity,
    };
  });
}

async function confirmCandidate(
  tx: Tx,
  chosenId: number,
  embedding: number[],
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

async function updateLastSeen(tx: Tx, canonicalId: number): Promise<void> {
  await tx.execute(
    sql`UPDATE canonical_topics SET last_seen = now() WHERE id = ${canonicalId}`,
  );
}

async function upsertAliases(
  tx: Tx,
  canonicalId: number,
  aliases: readonly string[],
): Promise<number> {
  let inserted = 0;
  for (const alias of aliases) {
    if (alias.trim().length === 0) continue;
    const result = await tx.execute(
      sql`INSERT INTO canonical_topic_aliases (canonical_topic_id, alias)
         VALUES (${canonicalId}, ${alias})
         ON CONFLICT (canonical_topic_id, lower(alias)) DO NOTHING
         RETURNING id`,
    );
    inserted += result.rows.length;
  }
  return inserted;
}

async function insertJunction(
  tx: Tx,
  args: {
    episodeId: number;
    canonicalId: number;
    matchMethod: "auto" | "llm_disambig" | "new";
    similarity: number | null;
    coverageScore: number;
  },
): Promise<void> {
  await tx.execute(
    sql`INSERT INTO episode_canonical_topics
         (episode_id, canonical_topic_id, match_method, similarity_to_top_match, coverage_score)
       VALUES (${args.episodeId}, ${args.canonicalId}, ${args.matchMethod}, ${args.similarity}, ${args.coverageScore})`,
  );
}

async function insertCanonical(
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

// ---- Main entry point ------------------------------------------------------

export async function resolveTopic(
  input: ResolveTopicInput,
): Promise<ResolveTopicResult> {
  if (
    input.identityEmbedding.length !== EMBEDDING_DIMENSION ||
    input.contextEmbedding.length !== EMBEDDING_DIMENSION
  ) {
    throw new EntityResolutionError("invalid_embedding_dim");
  }

  const tx1Result = await transactional<ResolveTopicResult | PendingDisambig>(
    async (tx1) => runTx1(tx1 as unknown as Tx, input),
  );

  if (!("pending" in tx1Result)) {
    return tx1Result;
  }

  const chosenId = await callDisambiguator(input, tx1Result.candidates);
  return transactional<ResolveTopicResult>(async (tx2) =>
    runTx2(
      tx2 as unknown as Tx,
      input,
      tx1Result.candidates,
      chosenId,
      tx1Result.versionTokenForcedDisambig,
    ),
  );
}

async function runTx1(
  tx: Tx,
  input: ResolveTopicInput,
): Promise<ResolveTopicResult | PendingDisambig> {
  await acquireLock(tx, input.label, input.kind);

  const exact = await exactLookup(tx, input.label, input.kind);
  if (exact !== null) {
    await updateLastSeen(tx, exact.id);
    const aliasesAdded = await upsertAliases(tx, exact.id, input.aliases);
    await insertJunction(tx, {
      episodeId: input.episodeId,
      canonicalId: exact.id,
      matchMethod: "auto",
      similarity: 1.0,
      coverageScore: input.coverageScore,
    });
    return {
      canonicalId: exact.id,
      matchMethod: "auto",
      similarityToTopMatch: 1.0,
      aliasesAdded,
      versionTokenForcedDisambig: false,
      candidatesConsidered: 0,
    };
  }

  await setEfSearch(tx);
  const candidates = await runKnn(tx, input.identityEmbedding);
  const top = candidates[0];
  const versionMismatch = top
    ? hasVersionTokenMismatch(input.label, top.label)
    : false;

  // Auto-match
  if (
    top &&
    top.similarity > AUTO_MATCH_SIMILARITY_THRESHOLD &&
    top.kind === input.kind &&
    !versionMismatch
  ) {
    await updateLastSeen(tx, top.id);
    const aliasesAdded = await upsertAliases(tx, top.id, input.aliases);
    await insertJunction(tx, {
      episodeId: input.episodeId,
      canonicalId: top.id,
      matchMethod: "auto",
      similarity: top.similarity,
      coverageScore: input.coverageScore,
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

  // Disambig defer
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
    const aliasesAdded = await upsertAliases(tx, newId, input.aliases);
    await insertJunction(tx, {
      episodeId: input.episodeId,
      canonicalId: newId,
      matchMethod: "new",
      similarity: null,
      coverageScore: input.coverageScore,
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

  // ON CONFLICT DO NOTHING returned 0 rows — recover via exact-lookup,
  // never another kNN (kNN can't see active-but-old event-type rows;
  // ADR-042 line 156 / ADR-044).
  const recovered = await exactLookup(tx, input.label, input.kind);
  if (recovered === null) {
    throw new EntityResolutionError("conflict_recovery_failed");
  }
  await updateLastSeen(tx, recovered.id);
  const aliasesAdded = await upsertAliases(tx, recovered.id, input.aliases);
  await insertJunction(tx, {
    episodeId: input.episodeId,
    canonicalId: recovered.id,
    matchMethod: "auto",
    similarity: 1.0,
    coverageScore: input.coverageScore,
  });
  return {
    canonicalId: recovered.id,
    matchMethod: "auto",
    similarityToTopMatch: 1.0,
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
    candidates.map((c) => ({
      id: c.id,
      label: c.label,
      kind: c.kind,
      summary: c.summary,
    })),
  );
  let raw: string;
  try {
    raw = await generateCompletion([{ role: "user", content: prompt }], {
      maxTokens: 256,
      temperature: 0,
    });
  } catch (err) {
    throw new EntityResolutionError("disambig_failed", { cause: err });
  }
  try {
    const parsed = parseJsonResponse<unknown>(raw);
    return disambigSchema.parse(parsed).chosen_id;
  } catch (err) {
    throw new EntityResolutionError("disambig_failed", { cause: err });
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

  const candidateConsidered = candidates.length;

  // Some other writer may have landed our entity while we were talking to
  // the LLM — defer to it (ADR-044 §two-phase split).
  const exact = await exactLookup(tx, input.label, input.kind);
  if (exact !== null) {
    await updateLastSeen(tx, exact.id);
    const aliasesAdded = await upsertAliases(tx, exact.id, input.aliases);
    await insertJunction(tx, {
      episodeId: input.episodeId,
      canonicalId: exact.id,
      matchMethod: "auto",
      similarity: 1.0,
      coverageScore: input.coverageScore,
    });
    return {
      canonicalId: exact.id,
      matchMethod: "auto",
      similarityToTopMatch: 1.0,
      aliasesAdded,
      versionTokenForcedDisambig,
      candidatesConsidered: candidateConsidered,
    };
  }

  const candidateMatch =
    chosenId !== null ? candidates.find((c) => c.id === chosenId) : undefined;
  if (chosenId !== null && candidateMatch) {
    const confirmed = await confirmCandidate(
      tx,
      chosenId,
      input.identityEmbedding,
    );
    if (confirmed && confirmed.kind === input.kind) {
      await updateLastSeen(tx, confirmed.id);
      const aliasesAdded = await upsertAliases(tx, confirmed.id, input.aliases);
      await insertJunction(tx, {
        episodeId: input.episodeId,
        canonicalId: confirmed.id,
        matchMethod: "llm_disambig",
        similarity: confirmed.similarity,
        coverageScore: input.coverageScore,
      });
      return {
        canonicalId: confirmed.id,
        matchMethod: "llm_disambig",
        similarityToTopMatch: confirmed.similarity,
        aliasesAdded,
        versionTokenForcedDisambig,
        candidatesConsidered: candidateConsidered,
      };
    }
    // fall through to new-insert if candidate disappeared / wrong kind
  }

  const newId = await insertCanonical(tx, input);
  if (newId !== null) {
    const aliasesAdded = await upsertAliases(tx, newId, input.aliases);
    await insertJunction(tx, {
      episodeId: input.episodeId,
      canonicalId: newId,
      matchMethod: "new",
      similarity: null,
      coverageScore: input.coverageScore,
    });
    return {
      canonicalId: newId,
      matchMethod: "new",
      similarityToTopMatch: null,
      aliasesAdded,
      versionTokenForcedDisambig,
      candidatesConsidered: candidateConsidered,
    };
  }

  const recovered = await exactLookup(tx, input.label, input.kind);
  if (recovered === null) {
    throw new EntityResolutionError("conflict_recovery_failed");
  }
  await updateLastSeen(tx, recovered.id);
  const aliasesAdded = await upsertAliases(tx, recovered.id, input.aliases);
  await insertJunction(tx, {
    episodeId: input.episodeId,
    canonicalId: recovered.id,
    matchMethod: "auto",
    similarity: 1.0,
    coverageScore: input.coverageScore,
  });
  return {
    canonicalId: recovered.id,
    matchMethod: "auto",
    similarityToTopMatch: 1.0,
    aliasesAdded,
    versionTokenForcedDisambig,
    candidatesConsidered: candidateConsidered,
  };
}
