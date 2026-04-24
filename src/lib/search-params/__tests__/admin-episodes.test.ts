import { describe, it, expect } from "vitest";
import { loadAdminEpisodeSearchParams } from "@/lib/search-params/admin-episodes";

describe("loadAdminEpisodeSearchParams", () => {
  it("defaults page to 1 when not provided", () => {
    const result = loadAdminEpisodeSearchParams({});
    expect(result.page).toBe(1);
  });

  it("parses valid page number", () => {
    expect(loadAdminEpisodeSearchParams({ page: "3" }).page).toBe(3);
  });

  it("returns default 1 for invalid page values", () => {
    expect(loadAdminEpisodeSearchParams({ page: "abc" }).page).toBe(1);
  });

  it("parses page=0 as 0 (caller must clamp)", () => {
    expect(loadAdminEpisodeSearchParams({ page: "0" }).page).toBe(0);
  });

  it("parses comma-separated transcript statuses", () => {
    const result = loadAdminEpisodeSearchParams({
      transcriptStatus: "available,failed",
    });
    expect(result.transcriptStatus).toEqual(["available", "failed"]);
  });

  it("parses single transcript status as array", () => {
    const result = loadAdminEpisodeSearchParams({
      transcriptStatus: "available",
    });
    expect(result.transcriptStatus).toEqual(["available"]);
  });

  it("parses comma-separated summary statuses", () => {
    const result = loadAdminEpisodeSearchParams({
      summaryStatus: "queued,completed",
    });
    expect(result.summaryStatus).toEqual(["queued", "completed"]);
  });

  it("parses podcastId as integer", () => {
    expect(loadAdminEpisodeSearchParams({ podcastId: "42" }).podcastId).toBe(
      42,
    );
  });

  it("returns null for non-numeric podcastId", () => {
    expect(
      loadAdminEpisodeSearchParams({ podcastId: "abc" }).podcastId,
    ).toBeNull();
  });

  it("parses ISO date strings", () => {
    const result = loadAdminEpisodeSearchParams({
      dateFrom: "2026-01-15",
      dateTo: "2026-03-01",
    });
    expect(result.dateFrom).toEqual(new Date("2026-01-15"));
    expect(result.dateTo).toEqual(new Date("2026-03-01"));
  });

  it("returns null for invalid date strings", () => {
    const result = loadAdminEpisodeSearchParams({
      dateFrom: "not-a-date",
      dateTo: "invalid",
    });
    expect(result.dateFrom).toBeNull();
    expect(result.dateTo).toBeNull();
  });

  it("parses valid date while returning null for invalid date", () => {
    const result = loadAdminEpisodeSearchParams({
      dateFrom: "2026-01-15",
      dateTo: "invalid",
    });
    expect(result.dateFrom).toEqual(new Date("2026-01-15"));
    expect(result.dateTo).toBeNull();
  });

  it("returns null for missing optional params", () => {
    const result = loadAdminEpisodeSearchParams({});
    expect(result.podcastId).toBeNull();
    expect(result.transcriptStatus).toBeNull();
    expect(result.summaryStatus).toBeNull();
    expect(result.dateFrom).toBeNull();
    expect(result.dateTo).toBeNull();
  });
});
