// Shared embedding fixtures for tests that need a deterministic vector. The
// content is irrelevant to constraint / harness tests — they only need an
// array of the correct length to satisfy pgvector / Drizzle column types.

import { EMBEDDING_DIMENSION } from "@/lib/ai/embed-constants";

/** Build a fresh embedding vector with every element equal to `0.001`. */
export function buildEmbedding(): number[] {
  return Array.from({ length: EMBEDDING_DIMENSION }, () => 0.001);
}

// Singleton fixture vector. Callers that need their own array (e.g. to mutate
// or to compare references) should use `buildEmbedding()`; callers that only
// read should reuse this constant. Reading-only callers don't mutate it.
export const STABLE_EMBEDDING: number[] = buildEmbedding();
