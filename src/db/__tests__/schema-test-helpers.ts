// Shared helpers for schema integration smoke tests.
// Centralises Postgres error parsing for the Neon HTTP driver, which wraps
// the NeonDbError in `err.cause` rather than surfacing it directly.

import { expect } from "vitest";

export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

export function pgConstraint(err: unknown): string | undefined {
  const e = err as { constraint?: string; cause?: { constraint?: string } };
  return e?.cause?.constraint ?? e?.constraint;
}

export async function expectInsertRejects(
  insertPromise: Promise<unknown>,
  sqlstate: "23514" | "23505",
  constraint?: string,
) {
  const err = await insertPromise.catch((e: unknown) => e);
  expect(pgCode(err)).toBe(sqlstate);
  if (constraint) expect(pgConstraint(err)).toBe(constraint);
}
