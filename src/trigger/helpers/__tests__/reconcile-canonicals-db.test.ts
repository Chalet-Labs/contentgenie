// @vitest-environment node

/**
 * Pins helper SQL shapes so orchestrator refactors can't silently shift SQL
 * semantics. The orchestration-level decay matrix in
 * `reconcile-canonicals.test.ts` covers the same SQL through `runReconciliation`.
 */

import { describe, expect, it } from "vitest";

import {
  RECONCILE_DECAY_DAYS,
  RECONCILE_DECAY_KINDS,
  RECONCILE_LOOKBACK_DAYS,
} from "@/lib/reconcile-constants";
import {
  countEpisodesForCanonical,
  decayStaleCanonicals,
  fetchActiveCanonicals,
} from "@/trigger/helpers/reconcile-canonicals-db";
import { makeDbExecuteStub } from "@/test/db-execute-stub";
import { serializeSql } from "@/test/sql-fixture-queue";

describe("fetchActiveCanonicals", () => {
  it("issues a SELECT against canonical_topics with the lookback-days bound param", async () => {
    const { db, calls } = makeDbExecuteStub([{ rows: [] }]);
    await fetchActiveCanonicals(db);
    const { sqlText, params } = serializeSql(calls[0]);
    expect(sqlText).toMatch(
      /SELECT\s+id,\s*label,\s*kind,\s*summary,\s*identity_embedding/i,
    );
    expect(sqlText).toMatch(/FROM\s+canonical_topics/i);
    expect(sqlText).toMatch(/WHERE\s+status\s*=\s*'active'/i);
    expect(sqlText).toMatch(
      /last_seen\s*>\s*now\(\)\s*-\s*\(\s*\$\s*::int\s*\*\s*INTERVAL\s*'1 day'\s*\)/i,
    );
    expect(params).toContain(RECONCILE_LOOKBACK_DAYS);
  });

  it("coerces each row's identity_embedding via coerceEmbedding (Float32Array → number[])", async () => {
    const { db } = makeDbExecuteStub([
      {
        rows: [
          {
            id: 1,
            label: "alpha",
            kind: "release",
            summary: "s1",
            identity_embedding: new Float32Array([0.5, -0.25, 1]),
          },
        ],
      },
    ]);
    const rows = await fetchActiveCanonicals(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      label: "alpha",
      kind: "release",
      summary: "s1",
    });
    const embedding = rows[0].embedding;
    if (embedding === null) throw new Error("embedding should not be null");
    expect(embedding).toHaveLength(3);
    expect(embedding[0]).toBeCloseTo(0.5);
    expect(embedding[1]).toBeCloseTo(-0.25);
    expect(embedding[2]).toBeCloseTo(1);
  });

  it("returns embedding=null when the driver value is malformed (NaN element)", async () => {
    const { db } = makeDbExecuteStub([
      {
        rows: [
          {
            id: 2,
            label: "bad",
            kind: "release",
            summary: "s",
            identity_embedding: [1, NaN, 3],
          },
        ],
      },
    ]);
    const rows = await fetchActiveCanonicals(db);
    expect(rows[0].embedding).toBeNull();
  });

  // Upstream-transformation interaction case (checklist §4): the helper
  // surfaces N rows but does NOT filter; the orchestrator's clusterable count
  // can be 0 when every row's embedding fails coercion. Pins the contract that
  // a future "filter nulls in the SELECT" optimization would silently violate.
  it("returns rows with embedding=null when every identity_embedding is malformed (no helper-side filtering)", async () => {
    const { db } = makeDbExecuteStub([
      {
        rows: [
          {
            id: 1,
            label: "a",
            kind: "release",
            summary: "s",
            identity_embedding: [1, NaN, 3],
          },
          {
            id: 2,
            label: "b",
            kind: "release",
            summary: "s",
            identity_embedding: "not-a-vector",
          },
          {
            id: 3,
            label: "c",
            kind: "release",
            summary: "s",
            identity_embedding: [],
          },
        ],
      },
    ]);
    const rows = await fetchActiveCanonicals(db);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.embedding)).toEqual([null, null, null]);
  });
});

describe("countEpisodesForCanonical", () => {
  it("issues a count(*) against episode_canonical_topics with the canonical id bound", async () => {
    const { db, calls } = makeDbExecuteStub([{ rows: [{ count: 7 }] }]);
    const count = await countEpisodesForCanonical(db, 42);
    const { sqlText, params } = serializeSql(calls[0]);
    expect(sqlText).toMatch(/SELECT\s+count\(\*\)::int\s+AS\s+count/i);
    expect(sqlText).toMatch(/FROM\s+episode_canonical_topics/i);
    expect(sqlText).toMatch(/WHERE\s+canonical_topic_id\s*=\s*\$/i);
    expect(params).toContain(42);
    expect(count).toBe(7);
  });

  it("coerces a stringified count returned by the pg driver", async () => {
    const { db } = makeDbExecuteStub([{ rows: [{ count: "13" }] }]);
    expect(await countEpisodesForCanonical(db, 1)).toBe(13);
  });

  it("returns 0 when the result set is empty", async () => {
    const { db } = makeDbExecuteStub([{ rows: [] }]);
    expect(await countEpisodesForCanonical(db, 1)).toBe(0);
  });
});

describe("decayStaleCanonicals", () => {
  it("issues an UPDATE with status='active' guard, ongoing=false guard, kind=ANY whitelist, decay-days param, and RETURNING id", async () => {
    const { db, calls } = makeDbExecuteStub([{ rows: [] }]);
    await decayStaleCanonicals(db);
    const { sqlText, params } = serializeSql(calls[0]);
    expect(sqlText).toMatch(/UPDATE\s+canonical_topics/i);
    expect(sqlText).toMatch(/SET\s+status\s*=\s*'dormant'/i);
    expect(sqlText).toMatch(/WHERE\s+status\s*=\s*'active'/i);
    expect(sqlText).toMatch(/ongoing\s*=\s*false/i);
    expect(sqlText).toMatch(/kind\s*=\s*ANY\s*\(\s*ARRAY\[/i);
    expect(sqlText).toMatch(/\]::canonical_topic_kind\[\]\s*\)/i);
    expect(sqlText).toMatch(/last_seen\s*</i);
    expect(sqlText).toMatch(/RETURNING\s+id/i);
    expect(params).toContain(RECONCILE_DECAY_DAYS);
    // Tight assertion: the kind-bound params must be exactly the whitelist —
    // no additions, no duplicates, no omissions.
    const kindParams = params.filter(
      (p): p is (typeof RECONCILE_DECAY_KINDS)[number] =>
        typeof p === "string" &&
        (RECONCILE_DECAY_KINDS as readonly string[]).includes(p),
    );
    expect(kindParams).toEqual([...RECONCILE_DECAY_KINDS]);
  });

  it("returns the row count from the RETURNING clause", async () => {
    const { db } = makeDbExecuteStub([
      { rows: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    ]);
    expect(await decayStaleCanonicals(db)).toBe(3);
  });

  it("returns 0 when no rows decay", async () => {
    const { db } = makeDbExecuteStub([{ rows: [] }]);
    expect(await decayStaleCanonicals(db)).toBe(0);
  });
});
