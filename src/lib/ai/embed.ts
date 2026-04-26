/**
 * OpenRouter embedding helper — generates dense vector embeddings for text
 * using {@link EMBEDDING_MODEL} (1024-dim).
 *
 * See canonical-topics epic (#376).
 */

import "server-only";

const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
const REQUEST_TIMEOUT_MS = 30_000;

/** Embedding model deployed for all ContentGenie vector representations. */
export const EMBEDDING_MODEL = "perplexity/pplx-embed-v1-0.6b" as const;

/** Dimensionality of every vector returned by {@link EMBEDDING_MODEL}. */
export const EMBEDDING_DIMENSION = 1024 as const;

/**
 * Thrown by embedding helpers on API errors, missing configuration, or
 * dimension mismatches. Carries an optional HTTP {@link status} and the
 * original `cause` (native ES2022 `Error.cause`) for structured upstream
 * error handling.
 *
 * See canonical-topics epic (#376).
 */
export class EmbeddingError extends Error {
  readonly name = "EmbeddingError" as const;
  readonly status?: number;

  constructor(message: string, status?: number, cause?: unknown) {
    super(message, { cause });
    this.status = status;
  }
}

type EmbeddingRow = { index: number; embedding: number[] };
type EmbeddingsResponse = { data?: unknown };

function assertDimension(embedding: number[], rowIndex?: number): void {
  if (embedding.length !== EMBEDDING_DIMENSION) {
    const location = rowIndex !== undefined ? ` (row ${rowIndex})` : "";
    throw new EmbeddingError(
      `Embedding dimension mismatch${location}: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`,
    );
  }
}

function assertEmbeddingRow(
  row: unknown,
  rowIndex?: number,
): asserts row is EmbeddingRow {
  const loc = rowIndex !== undefined ? ` (row ${rowIndex})` : "";
  if (
    !row ||
    typeof row !== "object" ||
    typeof (row as EmbeddingRow).index !== "number" ||
    !Number.isSafeInteger((row as EmbeddingRow).index) ||
    !Array.isArray((row as EmbeddingRow).embedding)
  ) {
    throw new EmbeddingError(`Malformed embedding row${loc} from OpenRouter`);
  }
  const embedding = (row as EmbeddingRow).embedding;
  for (let i = 0; i < embedding.length; i++) {
    const value = embedding[i];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new EmbeddingError(
        `Malformed embedding row${loc}: non-finite value at index ${i}`,
      );
    }
  }
}

async function requestEmbeddings(
  input: string | string[],
): Promise<EmbeddingRow[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new EmbeddingError("OpenRouter API key is not configured");
  }

  let response: Response;
  try {
    response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "ContentGenie",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout = (err as Error)?.name === "TimeoutError";
    throw new EmbeddingError(
      isTimeout
        ? `OpenRouter embeddings request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : "Network error contacting OpenRouter embeddings endpoint",
      undefined,
      err,
    );
  }

  if (!response.ok) {
    let errorText = "";
    try {
      errorText = await response.text();
    } catch {
      errorText = "<failed to read error body>";
    }
    if (errorText.length > 500) {
      errorText = `${errorText.slice(0, 500)}… [truncated]`;
    }
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

  const rows = data.data;
  for (let i = 0; i < rows.length; i++) {
    assertEmbeddingRow(rows[i], i);
  }
  return rows as EmbeddingRow[];
}

/**
 * Generates a single embedding vector for the given text.
 *
 * Reads `OPENROUTER_API_KEY` at call time so the key can be rotated or
 * mocked in tests without reloading the module.
 *
 * See canonical-topics epic (#376).
 *
 * @throws {EmbeddingError} On missing API key, HTTP errors, malformed JSON,
 *   empty response, cardinality mismatch, or dimension mismatch.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const rows = await requestEmbeddings(text);
  if (rows.length !== 1) {
    throw new EmbeddingError(
      `Embedding count mismatch: expected 1, received ${rows.length}`,
    );
  }
  if (rows[0].index !== 0) {
    throw new EmbeddingError(
      `Embedding index mismatch: expected 0, got ${rows[0].index}`,
    );
  }
  const embedding = rows[0].embedding;
  assertDimension(embedding);
  return embedding;
}

/**
 * Generates embedding vectors for a batch of texts in a single API call.
 * The response is sorted by `index` to match the input order, and every
 * row is validated against {@link EMBEDDING_DIMENSION}.
 *
 * Reads `OPENROUTER_API_KEY` at call time so the key can be rotated or
 * mocked in tests without reloading the module.
 *
 * See canonical-topics epic (#376).
 *
 * @throws {EmbeddingError} On missing API key, HTTP errors, malformed JSON,
 *   empty response, or per-row dimension mismatch.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const rows = await requestEmbeddings(texts);
  rows.sort((a, b) => a.index - b.index);

  if (rows.length !== texts.length) {
    throw new EmbeddingError(
      `Embedding count mismatch: requested ${texts.length}, received ${rows.length}`,
    );
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].index !== i) {
      throw new EmbeddingError(
        `Embedding index mismatch at position ${i}: got index ${rows[i].index}`,
      );
    }
  }

  return rows.map((row) => {
    assertDimension(row.embedding, row.index);
    return row.embedding;
  });
}
