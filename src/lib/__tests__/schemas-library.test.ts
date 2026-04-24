import { describe, it, expect } from "vitest";
import {
  saveEpisodeSchema,
  unsaveEpisodeSchema,
  subscribeSchema,
  unsubscribeSchema,
} from "@/lib/schemas/library";

describe("saveEpisodeSchema", () => {
  const validPayload = {
    podcastIndexId: "ep-123",
    title: "Test Episode",
    podcast: {
      podcastIndexId: "pod-456",
      title: "Test Podcast",
    },
  };

  it("accepts a valid minimal payload", () => {
    const result = saveEpisodeSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts a full payload with all optional fields", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      description: "An episode description",
      audioUrl: "https://example.com/audio.mp3",
      duration: 1800,
      publishDate: "2024-01-15T00:00:00Z",
      podcast: {
        ...validPayload.podcast,
        description: "A podcast description",
        publisher: "Test Publisher",
        imageUrl: "https://example.com/art.jpg",
        rssFeedUrl: "https://example.com/feed.xml",
        categories: ["Technology", "Science"],
        totalEpisodes: 100,
      },
    });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from podcastIndexId", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      podcastIndexId: "  ep-123  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.podcastIndexId).toBe("ep-123");
    }
  });

  it("trims whitespace from title", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      title: "  Test Episode  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Test Episode");
    }
  });

  it("rejects empty podcastIndexId", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      podcastIndexId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only podcastIndexId", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      podcastIndexId: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const { title, ...noTitle } = validPayload;
    const result = saveEpisodeSchema.safeParse(noTitle);
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing podcast object", () => {
    const { podcast, ...noPodcast } = validPayload;
    const result = saveEpisodeSchema.safeParse(noPodcast);
    expect(result.success).toBe(false);
  });

  it("rejects missing podcast.podcastIndexId", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      podcast: { title: "Test" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing podcast.title", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      podcast: { podcastIndexId: "pod-1" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts ISO datetime publishDate", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      publishDate: "2024-06-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed publishDate", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      publishDate: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("requires duration to be a finite number", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      duration: Infinity,
    });
    expect(result.success).toBe(false);
  });

  it("strips unknown keys from top level", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      unknownKey: "should be stripped",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("unknownKey" in result.data).toBe(false);
    }
  });

  it("strips unknown keys from nested podcast object", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      podcast: {
        ...validPayload.podcast,
        extraField: "stripped",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("extraField" in result.data.podcast).toBe(false);
    }
  });

  it("accepts categories as string array in podcast", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      podcast: {
        ...validPayload.podcast,
        categories: ["Tech", "News"],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.podcast.categories).toEqual(["Tech", "News"]);
    }
  });

  it("treats empty-string URLs as undefined (RSS feed compat)", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      audioUrl: "",
      podcast: {
        ...validPayload.podcast,
        imageUrl: "",
        rssFeedUrl: "",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.audioUrl).toBeUndefined();
      expect(result.data.podcast.imageUrl).toBeUndefined();
      expect(result.data.podcast.rssFeedUrl).toBeUndefined();
    }
  });

  it("requires totalEpisodes to be a finite number in podcast", () => {
    const result = saveEpisodeSchema.safeParse({
      ...validPayload,
      podcast: {
        ...validPayload.podcast,
        totalEpisodes: NaN,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("unsaveEpisodeSchema", () => {
  it("accepts a valid payload", () => {
    const result = unsaveEpisodeSchema.safeParse({ podcastIndexId: "ep-123" });
    expect(result.success).toBe(true);
  });

  it("trims podcastIndexId", () => {
    const result = unsaveEpisodeSchema.safeParse({
      podcastIndexId: "  ep-123  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.podcastIndexId).toBe("ep-123");
    }
  });

  it("rejects empty podcastIndexId", () => {
    const result = unsaveEpisodeSchema.safeParse({ podcastIndexId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing podcastIndexId", () => {
    const result = unsaveEpisodeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("strips unknown keys", () => {
    const result = unsaveEpisodeSchema.safeParse({
      podcastIndexId: "ep-1",
      extra: "removed",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("extra" in result.data).toBe(false);
    }
  });
});

describe("subscribeSchema", () => {
  const validPayload = {
    podcastIndexId: "pod-123",
    title: "Test Podcast",
  };

  it("accepts a valid minimal payload", () => {
    const result = subscribeSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = subscribeSchema.safeParse({
      ...validPayload,
      description: "A podcast",
      publisher: "Publisher",
      imageUrl: "https://example.com/art.jpg",
      rssFeedUrl: "https://example.com/feed.xml",
      categories: ["Tech"],
      totalEpisodes: 50,
      latestEpisodeDate: "2024-06-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed latestEpisodeDate", () => {
    const result = subscribeSchema.safeParse({
      ...validPayload,
      latestEpisodeDate: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("trims podcastIndexId and title", () => {
    const result = subscribeSchema.safeParse({
      podcastIndexId: "  pod-123  ",
      title: "  Test  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.podcastIndexId).toBe("pod-123");
      expect(result.data.title).toBe("Test");
    }
  });

  it("rejects empty podcastIndexId", () => {
    const result = subscribeSchema.safeParse({
      podcastIndexId: "",
      title: "T",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const result = subscribeSchema.safeParse({
      podcastIndexId: "pod-1",
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("strips unknown keys", () => {
    const result = subscribeSchema.safeParse({
      ...validPayload,
      malicious: "data",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("malicious" in result.data).toBe(false);
    }
  });
});

describe("unsubscribeSchema", () => {
  it("accepts a valid payload", () => {
    const result = unsubscribeSchema.safeParse({ podcastIndexId: "pod-123" });
    expect(result.success).toBe(true);
  });

  it("trims podcastIndexId", () => {
    const result = unsubscribeSchema.safeParse({
      podcastIndexId: "  pod-123  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.podcastIndexId).toBe("pod-123");
    }
  });

  it("rejects empty podcastIndexId", () => {
    const result = unsubscribeSchema.safeParse({ podcastIndexId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing podcastIndexId", () => {
    const result = unsubscribeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("strips unknown keys", () => {
    const result = unsubscribeSchema.safeParse({
      podcastIndexId: "pod-1",
      extra: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("extra" in result.data).toBe(false);
    }
  });
});
