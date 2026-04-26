import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The Drizzle chain: db.select({...}).from(t).groupBy(...).orderBy(...).limit(n)
// Final `.limit()` resolves to the rows. Each prior step returns `chain` so we
// can spy on which steps were invoked and assert call counts.
const limitMock = vi.fn();
const chain = {
  from: vi.fn(() => chain),
  groupBy: vi.fn(() => chain),
  orderBy: vi.fn(() => chain),
  limit: (n: number) => limitMock(n),
};
const selectMock = vi.fn((_arg?: unknown) => chain);

vi.mock("@/db", () => ({
  db: {
    select: (arg?: unknown) => {
      selectMock(arg);
      return chain;
    },
  },
}));

vi.mock("@/db/schema", () => ({
  episodeTopics: { topic: "topic_col" },
}));

vi.mock("drizzle-orm", () => ({
  desc: (v: unknown) => ({ desc: v }),
  // Drizzle's `sql` is a tagged-template fn whose result also exposes `.as(alias)`
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings.join("?"),
    values,
    as: (alias: string) => ({ sql: strings.join("?"), values, alias }),
  }),
}));

import {
  getCategoryBanlist,
  invalidateCategoryBanlist,
} from "@/lib/category-banlist";

describe("category-banlist", () => {
  beforeEach(() => {
    invalidateCategoryBanlist();
    selectMock.mockClear();
    chain.from.mockClear();
    chain.groupBy.mockClear();
    chain.orderBy.mockClear();
    limitMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns top-N topic strings in DB order", async () => {
    limitMock.mockResolvedValue([
      { topic: "AI & Machine Learning", n: 42 },
      { topic: "Health & Longevity", n: 30 },
      { topic: "Productivity", n: 12 },
    ]);

    const result = await getCategoryBanlist();
    expect(result).toEqual([
      "AI & Machine Learning",
      "Health & Longevity",
      "Productivity",
    ]);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(chain.groupBy).toHaveBeenCalled();
    expect(chain.orderBy).toHaveBeenCalled();
  });

  it("returns empty array when no rows exist", async () => {
    limitMock.mockResolvedValue([]);
    const result = await getCategoryBanlist();
    expect(result).toEqual([]);
  });

  it("returns cached value within TTL without re-querying", async () => {
    limitMock.mockResolvedValue([{ topic: "AI", n: 1 }]);
    const first = await getCategoryBanlist();
    const second = await getCategoryBanlist();
    expect(first).toEqual(["AI"]);
    expect(second).toEqual(["AI"]);
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("re-queries after the TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T00:00:00Z"));

    limitMock
      .mockResolvedValueOnce([{ topic: "First", n: 1 }])
      .mockResolvedValueOnce([{ topic: "Second", n: 1 }]);

    const first = await getCategoryBanlist();
    expect(first).toEqual(["First"]);

    // Advance just past the 1h TTL
    vi.setSystemTime(new Date("2026-04-26T01:00:01Z"));

    const second = await getCategoryBanlist();
    expect(second).toEqual(["Second"]);
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it("invalidateCategoryBanlist forces a refetch on next call", async () => {
    limitMock
      .mockResolvedValueOnce([{ topic: "First", n: 1 }])
      .mockResolvedValueOnce([{ topic: "Refreshed", n: 1 }]);

    const first = await getCategoryBanlist();
    expect(first).toEqual(["First"]);

    invalidateCategoryBanlist();

    const second = await getCategoryBanlist();
    expect(second).toEqual(["Refreshed"]);
    expect(selectMock).toHaveBeenCalledTimes(2);
  });
});
