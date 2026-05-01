// Shared SQL-fixture-queue test harness used by tests that mock
// `transactional()` from `@/db/pool`. Fixtures match against substrings of
// serialized SQL emitted by Drizzle SQL objects, so callers don't need a live
// Postgres to exercise the resolver's branch table.
//
// Vitest hoisting note: `vi.mock("@/db/pool", factory)` is hoisted per file
// above all imports, and CANNOT be re-exported from this module — the call
// itself must remain inline in each consumer test file. Top-level imports
// referenced inside the factory body fail with "cannot access ... before
// initialization", so the factory must be `async` and dynamic-import the
// helpers it needs:
//
//   vi.mock("@/db/pool", async () => {
//     const { createTransactionalFixtureMock } = await import(
//       "@/test/sql-fixture-queue"
//     );
//     return { transactional: createTransactionalFixtureMock() };
//   });
//
// Use `createTransactionalFixtureMock()` for pure-mock files (no real-DB
// sub-suite) or `createTransactionalFixtureMockWithFallthrough(actual)`
// (delegates to real `transactional` when the fixture queue is empty) for
// mixed-mode files that interleave mocked sub-suites with real-DB sub-suites
// guarded by `describe.skipIf(!DATABASE_URL)`.
//
// Module-scoped state is per worker/file (Vitest isolates test files into
// separate module graphs by default), so two test files can each maintain
// their own fixture queue without cross-talk.

import { vi } from "vitest";

export interface SqlFixture {
  match: string | RegExp;
  rows: unknown[];
}

export interface RecordedCall {
  sql: string;
  params: unknown[];
}

export interface TxFixtures {
  rows: SqlFixture[];
}

export const txFixturesQueue: TxFixtures[] = [];
export const txCallLog: RecordedCall[][] = [];

export function setTxFixtures(rows: SqlFixture[]): void {
  txFixturesQueue.push({ rows });
}

export function getTxLog(index: number): RecordedCall[] {
  return txCallLog[index] ?? [];
}

export function allRecordedCalls(): RecordedCall[] {
  return txCallLog.flat();
}

export function resetTxState(): void {
  txFixturesQueue.length = 0;
  txCallLog.length = 0;
}

// Walk a Drizzle SQL object and produce a stable serialized string + params
// list. We don't need DB-correct rendering — just stable substrings for
// fixture matching and parameter extraction for assertions.
export function serializeSql(sqlObj: unknown): {
  sqlText: string;
  params: unknown[];
} {
  const params: unknown[] = [];
  const parts: string[] = [];
  const visit = (chunk: unknown) => {
    if (chunk == null) return;
    if (Array.isArray(chunk)) {
      chunk.forEach(visit);
      return;
    }
    if (
      typeof chunk === "string" ||
      typeof chunk === "number" ||
      typeof chunk === "boolean"
    ) {
      // Bare primitives at the top level of queryChunks are template-literal
      // interpolations — drizzle treats them as bound params. Static SQL
      // text comes through as StringChunk objects (handled below).
      params.push(chunk);
      parts.push("$");
      return;
    }
    const obj = chunk as { value?: unknown; queryChunks?: unknown[] };
    if (Array.isArray(obj.queryChunks)) {
      obj.queryChunks.forEach(visit);
      return;
    }
    // StringChunk: { value: string[] }
    if (Array.isArray(obj.value)) {
      parts.push(obj.value.join(""));
      return;
    }
    // Param-like: any other object with `value` is treated as a bound param
    if (obj.value !== undefined) {
      params.push(obj.value);
      parts.push("$");
      return;
    }
  };
  visit(sqlObj);
  return { sqlText: parts.join(" "), params };
}

function consumeFixturesAndRun(
  fn: (tx: unknown) => Promise<unknown>,
): Promise<unknown> {
  const fixtures = txFixturesQueue.shift() ?? { rows: [] };
  const recorded: RecordedCall[] = [];
  txCallLog.push(recorded);
  const tx = {
    execute: async (sqlObj: unknown) => {
      const { sqlText, params } = serializeSql(sqlObj);
      recorded.push({ sql: sqlText, params });
      const fixture = fixtures.rows.find((f) =>
        typeof f.match === "string"
          ? sqlText.includes(f.match)
          : f.match.test(sqlText),
      );
      return { rows: fixture?.rows ?? [] };
    },
  };
  return fn(tx);
}

/**
 * Build a `vi.fn` `transactional` mock that always consumes the next entry
 * from `txFixturesQueue` and records every `tx.execute(sql)` call. Use this
 * in pure-mock test files (no real-DB sub-suite).
 */
export function createTransactionalFixtureMock() {
  return vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    consumeFixturesAndRun(fn),
  );
}

/**
 * Build a `vi.fn` `transactional` mock that falls through to the real
 * `transactional` (from `vi.importActual`) when the fixture queue is empty.
 * Required for mixed-mode test files that interleave mocked sub-suites with
 * real-DB sub-suites guarded by `describe.skipIf(!DATABASE_URL)`.
 */
export function createTransactionalFixtureMockWithFallthrough(
  actual: typeof import("@/db/pool"),
) {
  return vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    if (txFixturesQueue.length === 0) {
      return (
        actual.transactional as unknown as (
          cb: (tx: unknown) => Promise<unknown>,
        ) => Promise<unknown>
      )(fn);
    }
    return consumeFixturesAndRun(fn);
  });
}
