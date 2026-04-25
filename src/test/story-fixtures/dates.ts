/**
 * Shared fixed dates for Storybook stories.
 *
 * All stories use these constants instead of Date.now() / new Date() to ensure
 * deterministic rendering for visual regression testing. See ADR-024.
 */

/** Reference "now" for all story data — 2026-01-15 at 10:00 UTC */
export const STORY_NOW = new Date("2026-01-15T10:00:00Z");

/** Two hours before STORY_NOW */
export const STORY_TWO_HOURS_AGO = new Date("2026-01-15T08:00:00Z");

/** Thirty minutes before STORY_NOW */
export const STORY_THIRTY_MIN_AGO = new Date("2026-01-15T09:30:00Z");

/** Three days before STORY_NOW — safely past the trending-snapshot staleness threshold */
export const STORY_THREE_DAYS_AGO = new Date("2026-01-12T10:00:00Z");
