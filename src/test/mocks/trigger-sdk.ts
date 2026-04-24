import { vi } from "vitest";

/**
 * Mock factory for `@trigger.dev/sdk`. Covers the common shape: `task` echoes
 * its config, `retry.onThrow` invokes the callback once, and `logger` has
 * no-op spies for info/warn/error.
 *
 * Callers spread `overrides` to add or replace sub-objects — e.g. pass
 * `{ schedules: { task: vi.fn((c) => c) } }` for scheduled tasks, or
 * `{ metadata: { set: spy } }` / `{ wait: { createToken: spy } }` per test.
 */
export function createTriggerSdkMock(overrides: Record<string, unknown> = {}) {
  return {
    task: vi.fn((config: unknown) => config),
    retry: {
      onThrow: vi.fn(async (fn: () => unknown) => fn()),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  };
}
