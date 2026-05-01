// Shared embedding fixtures for tests that need a deterministic vector. The
// content is irrelevant to constraint / harness tests — they only need an
// array of the correct length to satisfy pgvector / Drizzle column types.

import { EMBEDDING_DIMENSION } from "@/lib/ai/embed-constants";

export { EMBEDDING_DIMENSION };

/**
 * Stable fixture vector — content is irrelevant to constraint/harness tests
 * that only need an array of the correct length. Not frozen because callers
 * pass it to Drizzle field types declared as `number[]`.
 */
export const STABLE_EMBEDDING: number[] = Array.from(
  { length: EMBEDDING_DIMENSION },
  () => 0.001,
);

/**
 * Build a fresh embedding vector. Defaults to the same constant value used by
 * `STABLE_EMBEDDING`; callers can pass `value` to differentiate vectors when
 * a test depends on cosine-distance variance.
 */
export function buildEmbedding(value: number = 0.001): number[] {
  return Array.from({ length: EMBEDDING_DIMENSION }, () => value);
}
