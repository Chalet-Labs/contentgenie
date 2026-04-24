/**
 * Canonical shape for server-action return values that use a
 * success/error envelope. Omit `T` (defaults to `void`) for mutations that
 * return no data; pass a type to carry data on success.
 */
// Tuple-wrapping `[T] extends [void]` disables distributive conditional types,
// so `ActionResult<string | void>` does not split into multiple success variants.
export type ActionResult<T = void> =
  | ([T] extends [void] ? { success: true } : { success: true; data: T })
  | { success: false; error: string };
