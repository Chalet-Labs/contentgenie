// @vitest-environment node

/**
 * Direct unit tests for the SQL helpers in `reconcile-canonicals-db.ts`
 * (issue #435). The orchestration-level Phase 7 decay matrix in
 * `reconcile-canonicals.test.ts` still asserts the same SQL through the full
 * `runReconciliation` flow; these tests pin the helpers' shapes directly so
 * future refactors of the orchestrator can't silently shift SQL semantics.
 */

import { describe, expect, it } from "vitest";

import type { db as RealDb } from "@/db";
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
import { serializeSql } from "@/test/sql-fixture-queue";

/**
 * Build a queue-driven `db.execute` stub. Mirrors the scaffold in
 * `reconcile-canonicals.test.ts` so each test pops the next payload and
 * captures the raw Drizzle SQL object for `serializeSql` introspection.
 */
function makeDbStub(payloads: Array<{ rows: unknown[] }>): {
  db: typeof RealDb;
  calls: unknown[];
} {
  const queue = [...payloads];
  const calls: unknown[] = [];
  const execute = (sqlObj: unknown) => {
    calls.push(sqlObj);
    const next = queue.shift();
    if (!next) {
      throw new Error(
        `db.execute called more times than payloads provided (call #${calls.length})`,
      );
    }
    return Promise.resolve(next);
  };
  // The helpers only touch `database.execute`; the rest of the Drizzle surface
  // is irrelevant for these tests.
  const db = { execute } as unknown as typeof RealDb;
  return { db, calls };
}

describe("fetchActiveCanonicals", () => {
  it("issues a SELECT against canonical_topics with the lookback-days bound param", async () => {
    const { db, calls } = makeDbStub([{ rows: [] }]);
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
    const { db } = makeDbStub([
      {
        rows: [
          {
            id: 1,
            label: "alpha",
            kind: "release",
            summary: "s1",
            identity_embedding: new Float32Array([1, 0, 0]),
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
    expect(Array.isArray(rows[0].embedding)).toBe(true);
    expect(rows[0].embedding).toHaveLength(3);
  });

  it("returns embedding=null when the driver value is malformed (NaN element)", async () => {
    const { db } = makeDbStub([
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
});

describe("countEpisodesForCanonical", () => {
  it("issues a count(*) against episode_canonical_topics with the canonical id bound", async () => {
    const { db, calls } = makeDbStub([{ rows: [{ count: 7 }] }]);
    const count = await countEpisodesForCanonical(db, 42);
    const { sqlText, params } = serializeSql(calls[0]);
    expect(sqlText).toMatch(/SELECT\s+count\(\*\)::int\s+AS\s+count/i);
    expect(sqlText).toMatch(/FROM\s+episode_canonical_topics/i);
    expect(sqlText).toMatch(/WHERE\s+canonical_topic_id\s*=\s*\$/i);
    expect(params).toContain(42);
    expect(count).toBe(7);
  });

  it("coerces a stringified count returned by the pg driver", async () => {
    const { db } = makeDbStub([{ rows: [{ count: "13" }] }]);
    expect(await countEpisodesForCanonical(db, 1)).toBe(13);
  });

  it("returns 0 when the result set is empty", async () => {
    const { db } = makeDbStub([{ rows: [] }]);
    expect(await countEpisodesForCanonical(db, 1)).toBe(0);
  });
});

describe("decayStaleCanonicals", () => {
  it("issues an UPDATE with status='active' guard, ongoing=false guard, kind=ANY whitelist, decay-days param, and RETURNING id", async () => {
    const { db, calls } = makeDbStub([{ rows: [] }]);
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
    for (const kind of RECONCILE_DECAY_KINDS) {
      expect(params).toContain(kind);
    }
  });

  it("returns the row count from the RETURNING clause", async () => {
    const { db } = makeDbStub([{ rows: [{ id: 1 }, { id: 2 }, { id: 3 }] }]);
    expect(await decayStaleCanonicals(db)).toBe(3);
  });

  it("returns 0 when no rows decay", async () => {
    const { db } = makeDbStub([{ rows: [] }]);
    expect(await decayStaleCanonicals(db)).toBe(0);
  });
});
