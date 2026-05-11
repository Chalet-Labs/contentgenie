/**
 * Trigger.dev run status literals shared across UI/client components.
 *
 * Kept independent of `@trigger.dev/sdk` so this module is safe to import from
 * edge/server contexts without pulling the SDK runtime. The failure list is the
 * single source of truth; the all-terminal list derives from it.
 */

const TERMINAL_FAILURE_STATUS_LIST = [
  "FAILED",
  "CANCELED",
  "TIMED_OUT",
  "SYSTEM_FAILURE",
  "CRASHED",
  "EXPIRED",
] as const;

const TERMINAL_STATUS_LIST = [
  "COMPLETED",
  ...TERMINAL_FAILURE_STATUS_LIST,
] as const;

export type TerminalFailureStatus =
  (typeof TERMINAL_FAILURE_STATUS_LIST)[number];

export type TerminalStatus = (typeof TERMINAL_STATUS_LIST)[number];

// Sets are typed as ReadonlySet<string> so callers can pass the wider
// Trigger.dev `run.status` union directly to `.has` without an `as` cast.
// The narrow literal types remain available via the exports above for
// switch/case discriminators and function parameters.
export const TERMINAL_FAILURE_STATUSES: ReadonlySet<string> = new Set(
  TERMINAL_FAILURE_STATUS_LIST,
);

export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(
  TERMINAL_STATUS_LIST,
);
