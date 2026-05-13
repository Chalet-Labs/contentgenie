/**
 * Test fixture that mirrors the boolean helpers Trigger.dev attaches to every
 * `RealtimeRun` via `booleanHelpersFromRunStatus` in
 * `@trigger.dev/core/dist/.../runStream.js`. Production code reads these
 * booleans directly off `run`; in tests where `useRealtimeRun` is mocked, we
 * need to supply them or status-driven branches go untriggered.
 */

// Mirrors RunStatus from @trigger.dev/core/v3 — local to avoid importing a
// transitive package not listed in package.json.
type RunStatus =
  | "PENDING_VERSION"
  | "QUEUED"
  | "DELAYED"
  | "DEQUEUED"
  | "EXECUTING"
  | "WAITING"
  | "COMPLETED"
  | "CANCELED"
  | "FAILED"
  | "CRASHED"
  | "SYSTEM_FAILURE"
  | "EXPIRED"
  | "TIMED_OUT";

const FAILED_STATUSES = new Set<RunStatus>([
  "FAILED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "EXPIRED",
  "TIMED_OUT",
]);

export function realtimeRunFixture(
  status: RunStatus,
  extra: Record<string, unknown> = {},
) {
  const isFailed = FAILED_STATUSES.has(status);
  const isSuccess = status === "COMPLETED";
  // Spread `extra` first so neither `status` nor any derived helper boolean can
  // be overridden by callers — the fixture guarantees SDK-shape consistency.
  return {
    ...extra,
    status,
    isQueued: status === "QUEUED" || status === "DELAYED",
    isExecuting: status === "DEQUEUED" || status === "EXECUTING",
    isWaiting: status === "WAITING",
    // isCompleted: "ran to completion" (success or failure), NOT "reached terminal
    // state" — cancelled runs are terminal but not completed. Check
    // isCompleted || isCancelled for the full terminal-state predicate.
    isCompleted: isSuccess || isFailed,
    isFailed,
    isSuccess,
    isCancelled: status === "CANCELED",
  };
}
