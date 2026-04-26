import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateEmbedding,
  generateEmbeddings,
  EmbeddingError,
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL,
} from "@/lib/ai/embed";

const makeVec = (n: number): number[] => Array<number>(n).fill(0.1);

describe("embed helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // 1. Single-text success
  it("generateEmbedding returns embedding and sends correct request", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
    const embedding = makeVec(EMBEDDING_DIMENSION);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ index: 0, embedding }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateEmbedding("hello");
    expect(result).toEqual(embedding);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "HTTP-Referer": "https://example.com",
          "X-Title": "ContentGenie",
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.input).toBe("hello");
    expect(body.model).toBe(EMBEDDING_MODEL);
  });

  // 2. Batch success — sorted by index
  it("generateEmbeddings returns vectors sorted by response index", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const emb0 = makeVec(EMBEDDING_DIMENSION);
    const emb1 = makeVec(EMBEDDING_DIMENSION);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          // returned out-of-order on purpose
          data: [
            { index: 1, embedding: emb1 },
            { index: 0, embedding: emb0 },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateEmbeddings(["text0", "text1"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(emb0);
    expect(result[1]).toEqual(emb1);
    expect(fetchMock).toHaveBeenCalledOnce();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.input).toEqual(["text0", "text1"]);
    expect(body.model).toBe(EMBEDDING_MODEL);
  });

  // 3. 429 typed error
  it("generateEmbedding rejects with EmbeddingError on 429", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limited"),
      }),
    );
    await expect(generateEmbedding("hello")).rejects.toMatchObject({
      name: "EmbeddingError",
      status: 429,
    });
  });

  // 3b. Batch 429 typed error
  it("generateEmbeddings rejects with EmbeddingError on 429", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limited"),
      }),
    );
    await expect(generateEmbeddings(["a", "b"])).rejects.toMatchObject({
      name: "EmbeddingError",
      status: 429,
    });
  });

  // 4. 5xx propagation
  it("generateEmbedding rejects with EmbeddingError on 503", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve("Service Unavailable"),
      }),
    );
    await expect(generateEmbedding("hello")).rejects.toMatchObject({
      name: "EmbeddingError",
      status: 503,
    });
  });

  // 5. Malformed JSON
  it("generateEmbedding rejects with EmbeddingError on malformed JSON", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      }),
    );
    await expect(generateEmbedding("hello")).rejects.toMatchObject({
      name: "EmbeddingError",
      message: expect.stringMatching(/Invalid JSON/i),
    });
  });

  // 6a. Dimension mismatch — generateEmbedding
  it("generateEmbedding rejects when embedding dimension is wrong (6a)", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ data: [{ index: 0, embedding: makeVec(512) }] }),
      }),
    );
    const err = await generateEmbedding("hello").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmbeddingError);
    expect((err as EmbeddingError).message).toContain("512");
    expect((err as EmbeddingError).message).toContain(
      String(EMBEDDING_DIMENSION),
    );
  });

  // 6b. Dimension mismatch — generateEmbeddings, per-row assertion (mixed-length batch)
  it("generateEmbeddings rejects on per-row dimension mismatch in mixed-length batch (6b)", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { index: 0, embedding: makeVec(EMBEDDING_DIMENSION) },
              { index: 1, embedding: makeVec(768) },
            ],
          }),
      }),
    );
    const err = await generateEmbeddings(["a", "b"]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmbeddingError);
    expect((err as EmbeddingError).message).toContain("768");
    expect((err as EmbeddingError).message).toContain(
      String(EMBEDDING_DIMENSION),
    );
  });

  // 7. Missing API key
  it("generateEmbedding rejects when API key is absent", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(generateEmbedding("hello")).rejects.toMatchObject({
      name: "EmbeddingError",
      message: expect.stringMatching(/API key is not configured/i),
    });
  });

  // 8. Empty data array
  it("generateEmbedding rejects on empty data array", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      }),
    );
    await expect(generateEmbedding("hello")).rejects.toMatchObject({
      name: "EmbeddingError",
      message: expect.stringMatching(/No embeddings returned/i),
    });
  });

  // 9. Empty-input batch returns [] without calling fetch
  it("generateEmbeddings returns [] for empty input without calling fetch", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateEmbeddings([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 10. Response missing `data` key
  it("generateEmbedding rejects when response has no data field", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );
    await expect(generateEmbedding("hello")).rejects.toMatchObject({
      name: "EmbeddingError",
      message: expect.stringMatching(/No embeddings returned/i),
    });
  });

  // 11. Cardinality mismatch (response has fewer rows than input)
  it("generateEmbeddings rejects when response cardinality does not match input length", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ index: 0, embedding: makeVec(EMBEDDING_DIMENSION) }],
          }),
      }),
    );
    await expect(generateEmbeddings(["a", "b", "c"])).rejects.toMatchObject({
      name: "EmbeddingError",
      message: expect.stringMatching(/count mismatch|cardinality/i),
    });
  });

  // 12. Malformed row (missing embedding)
  it("generateEmbedding rejects on malformed row missing embedding field", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ index: 0 }] }),
      }),
    );
    await expect(generateEmbedding("hello")).rejects.toMatchObject({
      name: "EmbeddingError",
      message: expect.stringMatching(/malformed/i),
    });
  });
});

describe("public surface", () => {
  it("re-exports generateEmbedding and EMBEDDING_DIMENSION from @/lib/ai", async () => {
    const { generateEmbedding: fn, EMBEDDING_DIMENSION: dim } =
      await import("@/lib/ai");
    expect(typeof fn).toBe("function");
    expect(dim).toBe(1024);
  });
});
