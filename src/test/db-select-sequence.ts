import { vi, type Mock } from "vitest";

/**
 * Available chain methods after `.from(...)`. Tests opt into the methods their
 * code-under-test actually invokes; unused chains aren't materialised so the
 * helper stays cheap and the spy surface stays minimal.
 *
 * Resolution semantics: the chain returns the next fixture from `results` once
 * a terminal-shaped call is reached. Terminal calls in this helper:
 * - `.where(...)`                                              (`["where"]`)
 * - `.where(...).orderBy(...).limit(...)`                      (`["where","orderBy","limit"]`)
 * - `.innerJoin(...).where(...).orderBy(...).limit(...)`       (`["innerJoin","where","orderBy","limit"]`)
 *
 * Pass the methods used by the SUT in any order — the helper composes the
 * needed chain. If two terminal shapes are needed in the same SUT, request
 * both methods and the helper wires both.
 */
export type DbSelectChainMethod =
  | "where"
  | "innerJoin"
  | "leftJoin"
  | "orderBy"
  | "limit";

/**
 * Sets up a `db.select(...)` mock to return a fresh chain builder per call,
 * resolving each successive call to the next fixture in `results`.
 *
 * Default chain methods: `where`. Most server-action tests stop at `where`;
 * trigger tasks that join + order + limit pass `["innerJoin", "where",
 * "orderBy", "limit"]`.
 *
 * Returns the underlying `mockDbSelect` mock so tests can assert call counts.
 */
export function setupDbSelectSequence(
  mockDbSelect: Mock,
  results: unknown[],
  chainMethods: DbSelectChainMethod[] = ["where"],
): Mock {
  let callIndex = 0;
  mockDbSelect.mockImplementation(() => {
    const result = results[callIndex++] ?? [];

    const fromObj: Record<string, unknown> = {};

    if (chainMethods.includes("where")) {
      if (chainMethods.includes("orderBy") && chainMethods.includes("limit")) {
        fromObj.where = vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(result),
          }),
        });
      } else {
        fromObj.where = vi.fn().mockResolvedValue(result);
      }
    }

    if (chainMethods.includes("innerJoin")) {
      fromObj.innerJoin = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(result),
          }),
        }),
      });
    }

    if (chainMethods.includes("leftJoin")) {
      fromObj.leftJoin = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(result),
          }),
        }),
      });
    }

    return {
      from: vi.fn().mockReturnValue(fromObj),
    };
  });
  return mockDbSelect;
}
