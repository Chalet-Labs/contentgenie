import { describe, it, expect } from "vitest";
import {
  getBackNavigation,
  BACK_NAVIGATION,
} from "@/app/(app)/podcast/[id]/back-navigation";

describe("getBackNavigation", () => {
  it("returns correct navigation for each known key", () => {
    for (const key of Object.keys(BACK_NAVIGATION)) {
      expect(getBackNavigation(key)).toBe(BACK_NAVIGATION[key]);
    }
  });

  it("returns default (discover) for undefined", () => {
    expect(getBackNavigation(undefined)).toBe(BACK_NAVIGATION.discover);
  });

  it("returns default (discover) for unknown value", () => {
    expect(getBackNavigation("settings")).toBe(BACK_NAVIGATION.discover);
  });

  it("returns default (discover) for empty string", () => {
    expect(getBackNavigation("")).toBe(BACK_NAVIGATION.discover);
  });

  it("returns default (discover) for prototype-chain key", () => {
    expect(getBackNavigation("toString")).toBe(BACK_NAVIGATION.discover);
  });
});

describe("BACK_NAVIGATION", () => {
  it("contains exactly 4 entries", () => {
    expect(Object.keys(BACK_NAVIGATION)).toHaveLength(4);
  });

  it("contains all expected keys", () => {
    expect(Object.keys(BACK_NAVIGATION).sort()).toEqual([
      "dashboard",
      "discover",
      "library",
      "subscriptions",
    ]);
  });
});
