/**
 * Public, isomorphic constants for the embedding model used by ContentGenie.
 *
 * Extracted from `embed.ts` (which imports `server-only`) so the database
 * schema and other isomorphic modules can reference the canonical model
 * name and dimensionality without pulling in the server-only client.
 *
 * See canonical-topics epic (#376).
 */

/** Embedding model deployed for all ContentGenie vector representations. */
export const EMBEDDING_MODEL = "perplexity/pplx-embed-v1-0.6b" as const;

/** Dimensionality of every vector returned by {@link EMBEDDING_MODEL}. */
export const EMBEDDING_DIMENSION = 1024 as const;
