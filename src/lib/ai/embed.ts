/**
 * OpenRouter embedding helper — generates dense vector embeddings for text
 * using {@link EMBEDDING_MODEL} (1024-dim).
 *
 * See ADR-039 (canonical topics) — link will be added once #382 lands.
 */

const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

/** Embedding model deployed for all ContentGenie vector representations. */
export const EMBEDDING_MODEL = "perplexity/pplx-embed-v1-0.6b" as const;

/** Dimensionality of every vector returned by {@link EMBEDDING_MODEL}. */
export const EMBEDDING_DIMENSION = 1024 as const;

/**
 * Thrown by embedding helpers on API errors, missing configuration, or
 * dimension mismatches. Carries an optional HTTP {@link status} and the
 * original {@link cause} for structured upstream error handling.
 *
 * See ADR-039 (canonical topics) — link will be added once #382 lands.
 */
export class EmbeddingError extends Error {
  readonly name = "EmbeddingError" as const;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(message: string, status?: number, cause?: unknown) {
    super(message);
    this.status = status;
    this.cause = cause;
  }
}

type EmbeddingRow = { index: number; embedding: number[] };
type EmbeddingsResponse = { data?: EmbeddingRow[] };

function assertDimension(embedding: number[], rowIndex?: number): void {
  if (embedding.length !== EMBEDDING_DIMENSION) {
    const location = rowIndex !== undefined ? ` (row ${rowIndex})` : "";
    throw new EmbeddingError(
      `Embedding dimension mismatch${location}: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`,
    );
  }
}

/**
 * Generates a single embedding vector for the given text.
 *
 * Reads `OPENROUTER_API_KEY` at call time so the key can be rotated or
 * stubbed in tests without reloading the module.
 *
 * See ADR-039 (canonical topics) — link will be added once #382 lands.
 *
 * @throws {EmbeddingError} On missing API key, HTTP errors, malformed JSON,
 *   empty response, or dimension mismatch.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) {
    throw new EmbeddingError("OpenRouter API key is not configured");
  }

  const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "ContentGenie",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new EmbeddingError(
      `OpenRouter embeddings API error: ${response.status} - ${errorText}`,
      response.status,
    );
  }

  let data: EmbeddingsResponse;
  try {
    data = (await response.json()) as EmbeddingsResponse;
  } catch (err) {
    throw new EmbeddingError(
      "Invalid JSON from OpenRouter embeddings",
      undefined,
      err,
    );
  }

  if (!Array.isArray(data?.data) || data.data.length === 0) {
    throw new EmbeddingError("No embeddings returned from OpenRouter");
  }

  const embedding = data.data[0].embedding;
  assertDimension(embedding);
  return embedding;
}

/**
 * Generates embedding vectors for a batch of texts in a single API call.
 * The response is sorted by `index` to match the input order, and every
 * row is validated against {@link EMBEDDING_DIMENSION}.
 *
 * Reads `OPENROUTER_API_KEY` at call time so the key can be rotated or
 * stubbed in tests without reloading the module.
 *
 * See ADR-039 (canonical topics) — link will be added once #382 lands.
 *
 * @throws {EmbeddingError} On missing API key, HTTP errors, malformed JSON,
 *   empty response, or per-row dimension mismatch.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) {
    throw new EmbeddingError("OpenRouter API key is not configured");
  }

  const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "ContentGenie",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new EmbeddingError(
      `OpenRouter embeddings API error: ${response.status} - ${errorText}`,
      response.status,
    );
  }

  let data: EmbeddingsResponse;
  try {
    data = (await response.json()) as EmbeddingsResponse;
  } catch (err) {
    throw new EmbeddingError(
      "Invalid JSON from OpenRouter embeddings",
      undefined,
      err,
    );
  }

  if (!Array.isArray(data?.data) || data.data.length === 0) {
    throw new EmbeddingError("No embeddings returned from OpenRouter");
  }

  const sorted = [...data.data].sort((a, b) => a.index - b.index);

  for (const row of sorted) {
    assertDimension(row.embedding, row.index);
  }

  return sorted.map((row) => row.embedding);
}
