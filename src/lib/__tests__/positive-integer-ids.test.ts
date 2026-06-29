import { describe, expect, it } from "vitest";
import {
  isPositiveIntegerId,
  uniquePositiveIntegerIds,
} from "@/lib/positive-integer-ids";

describe("isPositiveIntegerId", () => {
  it("accepts finite positive integers only", () => {
    expect(isPositiveIntegerId(1)).toBe(true);
    expect(isPositiveIntegerId(42)).toBe(true);

    expect(isPositiveIntegerId(0)).toBe(false);
    expect(isPositiveIntegerId(-1)).toBe(false);
    expect(isPositiveIntegerId(1.5)).toBe(false);
    expect(isPositiveIntegerId(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isPositiveIntegerId("1")).toBe(false);
    expect(isPositiveIntegerId(null)).toBe(false);
  });
});

describe("uniquePositiveIntegerIds", () => {
  it("filters invalid values and preserves first-seen order", () => {
    expect(uniquePositiveIntegerIds([3, 0, 2, 3, -1, 2.5, 1, "4"])).toEqual([
      3, 2, 1,
    ]);
  });

  it("caps the returned unique IDs when maxIds is provided", () => {
    expect(uniquePositiveIntegerIds([1, 2, 2, 3, 4], { maxIds: 3 })).toEqual([
      1, 2, 3,
    ]);
  });

  it("returns an empty list for non-array input", () => {
    expect(uniquePositiveIntegerIds({ 0: 1, length: 1 })).toEqual([]);
  });
});
