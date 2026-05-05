/**
 * Tunable threshold constants for `detectThresholdDrift` (ADR-053 §5).
 *
 * Import and mock this module in tests to pin behavior independently of
 * operator tuning — changing these values must not break any test.
 */

/** auto-match rate below this value triggers an alert. */
export const DRIFT_AUTO_RATE_FLOOR = 0.4;

/** auto-match rate below this value (but above the floor) triggers a warning. */
export const DRIFT_AUTO_RATE_WARN = 0.55;

/** llm_disambig rate above this value triggers an alert. */
export const DRIFT_DISAMBIG_RATE_CEILING = 0.4;

/** llm_disambig rate above this value (but below the ceiling) triggers a warning. */
export const DRIFT_DISAMBIG_RATE_WARN = 0.3;

export type DriftStatus = "ok" | "warn" | "alert";
