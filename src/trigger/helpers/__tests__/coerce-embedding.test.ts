// @vitest-environment node

/**
 * Direct unit tests for `coerceEmbedding` (issue #435).
 *
 * The function normalises the three driver-side surface shapes of the Postgres
 * `vector` column (`number[]`, `Float32Array`, `"[1,2,3]"` string) into a
 * `number[]` and applies four rejection guards (non-finite, empty, zero-norm,
 * unrecognised shape). Coverage matrix mirrors the seven paths called out in
 * the issue plus the explicit zero-norm guard.
 */

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
