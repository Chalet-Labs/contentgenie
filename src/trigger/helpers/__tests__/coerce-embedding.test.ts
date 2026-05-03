// @vitest-environment node

import { describe, expect, it } from "vitest";

import { coerceEmbedding } from "@/trigger/helpers/coerce-embedding";

describe("coerceEmbedding", () => {
  describe("happy paths", () => {
    it("accepts a number[] and returns it as a fresh number[]", () => {
      const result = coerceEmbedding([1, 2, 3]);
      expect(result).toEqual([1, 2, 3]);
    });

    it("coerces a Float32Array to number[]", () => {
      const result = coerceEmbedding(new Float32Array([0.5, -0.25, 1]));
      // Float32 precision drift is expected — assert via toBeCloseTo per element.
      expect(result).toHaveLength(3);
      expect(result![0]).toBeCloseTo(0.5);
      expect(result![1]).toBeCloseTo(-0.25);
      expect(result![2]).toBeCloseTo(1);
    });

    it('parses a "[1,2,3]" string into number[]', () => {
      expect(coerceEmbedding("[1,2,3]")).toEqual([1, 2, 3]);
    });

    it("parses a string with whitespace and decimal values", () => {
      expect(coerceEmbedding("[ 0.1 , -0.2 , 0.3 ]")).toEqual([0.1, -0.2, 0.3]);
    });

    it("coerces numeric strings inside a number[] via Number()", () => {
      // pg may surface decimal columns as strings — Number() coercion handles it.
      expect(coerceEmbedding(["1", "2", "3"])).toEqual([1, 2, 3]);
    });
  });

  describe("malformed strings → null", () => {
    it("returns null for a string without brackets", () => {
      expect(coerceEmbedding("1,2,3")).toBeNull();
    });

    it("returns null for a string with garbage inside the brackets", () => {
      // Number("foo") → NaN, tripping the finite-value guard.
      expect(coerceEmbedding("[foo,bar]")).toBeNull();
    });

    it("returns null for an empty bracketed string", () => {
      expect(coerceEmbedding("[]")).toBeNull();
    });

    it("returns null for a single-bracket string", () => {
      expect(coerceEmbedding("[")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(coerceEmbedding("")).toBeNull();
    });

    it("returns null for a whitespace-only string", () => {
      expect(coerceEmbedding("   ")).toBeNull();
    });

    it("returns null when brackets are mismatched (']['→ no leading '[')", () => {
      expect(coerceEmbedding("][")).toBeNull();
    });

    // The trim-then-filter-empties parser silently drops empty/whitespace-only
    // tokens, so `"[1,2,]"` parses to `[1,2]` and `"[1, ,2]"` parses to
    // `[1,2]` (uniform across pure-empty and whitespace-only). Pinning so a
    // future stricter parser can't change orchestrator-input counts unnoticed.
    it("silently drops a trailing empty token after a comma (current behavior)", () => {
      expect(coerceEmbedding("[1,2,]")).toEqual([1, 2]);
    });

    it("silently drops a whitespace-only middle token (current behavior, was [1,0,2] under old filter(Boolean) parser)", () => {
      expect(coerceEmbedding("[1, ,2]")).toEqual([1, 2]);
    });
  });

  describe("non-finite element guard → null", () => {
    it("returns null when an element is NaN", () => {
      expect(coerceEmbedding([1, NaN, 3])).toBeNull();
    });

    it("returns null when an element is Infinity", () => {
      expect(coerceEmbedding([1, Infinity, 3])).toBeNull();
    });

    it("returns null when an element is -Infinity", () => {
      expect(coerceEmbedding([1, -Infinity, 3])).toBeNull();
    });

    it("returns null for a Float32Array containing NaN", () => {
      expect(coerceEmbedding(new Float32Array([1, NaN, 3]))).toBeNull();
    });
  });

  describe("empty vector guard → null", () => {
    it("returns null for an empty number[]", () => {
      expect(coerceEmbedding([])).toBeNull();
    });

    it("returns null for an empty Float32Array", () => {
      expect(coerceEmbedding(new Float32Array([]))).toBeNull();
    });
  });

  describe("zero-norm guard → null", () => {
    it("returns null for an all-zero vector (would NaN cosineDistance)", () => {
      expect(coerceEmbedding([0, 0, 0])).toBeNull();
    });

    it("returns null for an all-zero string vector", () => {
      expect(coerceEmbedding("[0,0,0]")).toBeNull();
    });
  });

  describe("unrecognised shape → null", () => {
    it("returns null for a plain object", () => {
      expect(coerceEmbedding({ a: 1, b: 2 })).toBeNull();
    });

    it("returns null for a number primitive", () => {
      expect(coerceEmbedding(42)).toBeNull();
    });

    it("returns null for null", () => {
      expect(coerceEmbedding(null)).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(coerceEmbedding(undefined)).toBeNull();
    });

    it("returns null for a boolean", () => {
      expect(coerceEmbedding(true)).toBeNull();
    });
  });
});
