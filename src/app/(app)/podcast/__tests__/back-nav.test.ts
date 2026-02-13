import { describe, it, expect } from "vitest";
import {
  getBackNavigation,
  BACK_NAVIGATION,
} from "@/app/(app)/podcast/[id]/back-navigation";

describe("getBackNavigation", () => {
  it("returns discover navigation for from='discover'", () => {
    const result = getBackNavigation("discover");
    expect(result).toEqual({ href: "/discover", label: "Back to Discover" });
  });

  it("returns subscriptions navigation for from='subscriptions'", () => {
    const result = getBackNavigation("subscriptions");
    expect(result).toEqual({
      href: "/subscriptions",
      label: "Back to Subscriptions",
    });
  });

  it("returns dashboard navigation for from='dashboard'", () => {
    const result = getBackNavigation("dashboard");
    expect(result).toEqual({ href: "/dashboard", label: "Back to Dashboard" });
  });

  it("returns library navigation for from='library'", () => {
    const result = getBackNavigation("library");
    expect(result).toEqual({ href: "/library", label: "Back to Library" });
  });

  it("returns default (discover) for undefined", () => {
    const result = getBackNavigation(undefined);
    expect(result).toEqual({ href: "/discover", label: "Back to Discover" });
  });

  it("returns default (discover) for unknown value", () => {
    const result = getBackNavigation("settings");
    expect(result).toEqual({ href: "/discover", label: "Back to Discover" });
  });

  it("returns default (discover) for empty string", () => {
    const result = getBackNavigation("");
    expect(result).toEqual({ href: "/discover", label: "Back to Discover" });
  });

  it("returns default (discover) for prototype-chain key", () => {
    const result = getBackNavigation("toString");
    expect(result).toEqual({ href: "/discover", label: "Back to Discover" });
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
