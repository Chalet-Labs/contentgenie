/**
 * Test fixture that mirrors the boolean helpers Trigger.dev attaches to every
 * `RealtimeRun` via `booleanHelpersFromRunStatus` in
 * `@trigger.dev/core/dist/.../runStream.js`. Production code reads these
 * booleans directly off `run`; in tests where `useRealtimeRun` is mocked, we
 * need to supply them or status-driven branches go untriggered.
 */

const FAILED_STATUSES = new Set([
  "FAILED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "EXPIRED",
  "TIMED_OUT",
]);

export function realtimeRunFixture(
  status: string,
  extra: Record<string, unknown> = {},
) {
  const isFailed = FAILED_STATUSES.has(status);
  const isSuccess = status === "COMPLETED";
  return {
    status,
    isQueued: status === "QUEUED" || status === "DELAYED",
    isExecuting: status === "DEQUEUED" || status === "EXECUTING",
    isWaiting: status === "WAITING",
    isCompleted: isSuccess || isFailed,
    isFailed,
    isSuccess,
    isCancelled: status === "CANCELED",
    ...extra,
  };
}
