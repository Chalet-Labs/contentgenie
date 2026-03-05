import { describe, it, expect } from "vitest";
import {
  LIBRARY_ENTRY_COLUMNS,
  EPISODE_LIST_COLUMNS,
  PODCAST_LIST_COLUMNS,
  COLLECTION_LIST_COLUMNS,
} from "@/db/library-columns";

describe("Library column selection constants", () => {
  it("LIBRARY_ENTRY_COLUMNS includes exactly the expected fields", () => {
    expect(Object.keys(LIBRARY_ENTRY_COLUMNS).sort()).toEqual([
      "collectionId",
      "episodeId",
      "id",
      "notes",
      "rating",
      "savedAt",
      "userId",
    ]);
  });

  it("EPISODE_LIST_COLUMNS includes exactly the expected fields", () => {
    expect(Object.keys(EPISODE_LIST_COLUMNS).sort()).toEqual([
      "audioUrl",
      "description",
      "duration",
      "id",
      "podcastIndexId",
      "publishDate",
      "title",
      "worthItScore",
    ]);
  });

  it("EPISODE_LIST_COLUMNS excludes large text fields", () => {
    const columns = EPISODE_LIST_COLUMNS as Record<string, boolean>;
    expect(columns).not.toHaveProperty("transcription");
    expect(columns).not.toHaveProperty("summary");
    expect(columns).not.toHaveProperty("keyTakeaways");
    expect(columns).not.toHaveProperty("worthItReason");
    expect(columns).not.toHaveProperty("worthItDimensions");
    expect(columns).not.toHaveProperty("processingError");
    expect(columns).not.toHaveProperty("summaryRunId");
    expect(columns).not.toHaveProperty("summaryStatus");
    expect(columns).not.toHaveProperty("processedAt");
  });

  it("PODCAST_LIST_COLUMNS includes exactly the expected fields", () => {
    expect(Object.keys(PODCAST_LIST_COLUMNS).sort()).toEqual([
      "id",
      "imageUrl",
      "podcastIndexId",
      "title",
    ]);
  });

  it("COLLECTION_LIST_COLUMNS includes exactly the expected fields", () => {
    expect(Object.keys(COLLECTION_LIST_COLUMNS).sort()).toEqual([
      "id",
      "name",
    ]);
  });

  it("all column values are true (allowlist pattern)", () => {
    const allColumns = {
      ...LIBRARY_ENTRY_COLUMNS,
      ...EPISODE_LIST_COLUMNS,
      ...PODCAST_LIST_COLUMNS,
      ...COLLECTION_LIST_COLUMNS,
    };
    for (const [key, value] of Object.entries(allColumns)) {
      expect(value, `${key} should be true`).toBe(true);
    }
  });
});
