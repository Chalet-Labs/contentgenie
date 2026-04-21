/**
 * Canonical shape for server-action return values that use a
 * success/error envelope.
 *
 * - For actions that return data on success, set `T` to the data type
 *   (e.g. `ActionResult<AudioEpisode[]>` →
 *   `{ success: true; data: AudioEpisode[] } | { success: false; error: string }`).
 * - For actions that return nothing on success, omit `T` (defaults to `void`)
 *   (e.g. `ActionResult` → `{ success: true } | { success: false; error: string }`).
 *
 * `error` is always a user-presentable string. Error classification
 * (auth / validation / db) is deliberately not modelled here — see the
 * PR #305 review discussion tracked as a follow-up.
 */
export type ActionResult<T = void> =
  // `[T] extends [void]` (tuple-wrapped) disables distributive conditional
  // types, so a union like `ActionResult<string | void>` does not split into
  // multiple success variants. Side effect: `ActionResult<undefined>` still
  // collapses to the no-data branch because `undefined extends void` is true.
  | ([T] extends [void] ? { success: true } : { success: true; data: T })
  | { success: false; error: string }
