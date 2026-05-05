import { describe, it, expect } from "vitest";
import { loadAdminTopicsObservabilitySearchParams } from "@/lib/search-params/admin-topics-observability";

describe("loadAdminTopicsObservabilitySearchParams", () => {
  it("defaults window to '7d' when not provided", () => {
    const result = loadAdminTopicsObservabilitySearchParams({});
    expect(result.window).toBe("7d");
  });

  it("accepts '24h' literal", () => {
    const result = loadAdminTopicsObservabilitySearchParams({
      window: "24h",
    });
    expect(result.window).toBe("24h");
  });

  it("accepts '7d' literal", () => {
    const result = loadAdminTopicsObservabilitySearchParams({ window: "7d" });
    expect(result.window).toBe("7d");
  });

  it("accepts '30d' literal", () => {
    const result = loadAdminTopicsObservabilitySearchParams({ window: "30d" });
    expect(result.window).toBe("30d");
  });

  it("falls back to default '7d' for unknown values", () => {
    const result = loadAdminTopicsObservabilitySearchParams({
      window: "invalid",
    });
    expect(result.window).toBe("7d");
  });

  it("falls back to default '7d' when window is missing", () => {
    const result = loadAdminTopicsObservabilitySearchParams({
      other: "param",
    });
    expect(result.window).toBe("7d");
  });
});

describe("loadAdminTopicsObservabilitySearchParams — granularity", () => {
  it("defaults granularity to 'day' when not provided", () => {
    const result = loadAdminTopicsObservabilitySearchParams({});
    expect(result.granularity).toBe("day");
  });

  it("accepts 'day' literal", () => {
    const result = loadAdminTopicsObservabilitySearchParams({
      granularity: "day",
    });
    expect(result.granularity).toBe("day");
  });

  it("accepts 'week' literal", () => {
    const result = loadAdminTopicsObservabilitySearchParams({
      granularity: "week",
    });
    expect(result.granularity).toBe("week");
  });

  it("falls back to default 'day' for unknown granularity values", () => {
    const result = loadAdminTopicsObservabilitySearchParams({
      granularity: "month",
    });
    expect(result.granularity).toBe("day");
  });

  it("falls back to default 'day' when granularity is missing", () => {
    const result = loadAdminTopicsObservabilitySearchParams({
      window: "7d",
    });
    expect(result.granularity).toBe("day");
  });
});
