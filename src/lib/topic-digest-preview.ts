/**
 * Max character count for the dashboard digest-list consensus preview before
 * the row appends an ellipsis. 120 is a rough fit for ~2 lines at the card's
 * default column width without dominating the row visually; the real signal
 * for users is the topic label + kind badge above it.
 *
 * Lives in its own module (rather than `@/app/actions/topics`) because
 * `"use server"` files cannot export non-async values; tests, components,
 * and the action all import from here.
 */
export const MAX_CONSENSUS_PREVIEW_CHARS = 120;
