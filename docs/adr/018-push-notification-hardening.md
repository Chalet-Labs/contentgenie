# ADR-018: Push Notification Hardening — Topic Header and CSRF Custom Header Check

**Status:** Proposed
**Date:** 2026-03-08
**Issue:** [#159](https://github.com/Chalet-Labs/contentgenie/issues/159) (PR review findings from #158)

## Context

A review of PR #158 identified two defense-in-depth improvements for the push notification system:

1. **Potential duplicate push dispatches:** `sendPushToUser` in both `src/trigger/helpers/notifications.ts` and `src/lib/notifications.ts` sends push notifications to all of a user's subscriptions, but if the same function is called twice for the same event (e.g., due to a Trigger.dev task retry or concurrent processing), the user could receive duplicate push messages on devices that were offline when the first message was dispatched.

2. **CSRF protection on push subscription API routes:** The `POST /api/push/subscribe` and `DELETE /api/push/subscribe` routes are authenticated via Clerk's `auth()` (cookie-based), but lack explicit CSRF protection beyond the implicit `SameSite` cookie attribute and `Content-Type: application/json` CORS preflight trigger.

### Existing Deduplication Layers

The system already has three dedup mechanisms:
- **DB-level:** `createNotificationsForSubscribers` iterates unique subscribers; `createBulkNotifications` deduplicates user IDs with `Array.from(new Set(...))`.
- **Service Worker tag collapsing (client-side):** `sw.js` passes `tag: data.tag` to `showNotification()`. Tags like `new_episode-42` cause the browser to replace existing notifications with the same tag.
- **Push endpoint uniqueness:** `push_subscriptions` has a unique constraint on `endpoint`, preventing the same browser from having duplicate subscriptions.

**Missing layer:** RFC 8030 Section 5.4 defines a `Topic` header that causes the push service to replace any pending (undelivered) message with the same topic for the same subscription. This operates at the push service level — before the message reaches the device. The `web-push` library supports this via a `topic` option on `sendNotification()`.

### Existing CSRF Mitigations

- `SameSite` cookie attribute on Clerk's `__session` cookie (blocks cross-site POST in modern browsers)
- `Content-Type: application/json` header set by client-side `fetch()` calls (triggers CORS preflight for cross-origin requests; not enforced server-side)
- No `Access-Control-Allow-Origin` headers returned (browser blocks cross-origin preflight)
- Push endpoint allowlist validation
- 60-second JWT expiry

## Options Considered

### Deduplication

#### Option A: Add server-side dedup via in-memory Set with TTL
- **Pro:** Prevents duplicate sends within the same process.
- **Con:** Trigger.dev tasks run as isolated invocations — no shared memory. Would require external state (Redis, DB) which adds complexity and latency. The existing tag and topic mechanisms handle the user-facing dedup adequately.

#### Option B: Add `topic` to `webpush.sendNotification()` options (chosen)
- **Pro:** One-line change per `sendPushToUser`. Uses the RFC 8030 standard mechanism. Push services (FCM, Mozilla, Apple) coalesce pending messages with the same topic — if a user's device is offline, only the latest message per topic is delivered. Works with existing `tag` field already in the payload. No external state needed.
- **Con:** `topic` is limited to 32 URL-safe base64 characters. Must be derived from the existing `tag` field. Only affects undelivered messages — already-delivered duplicates are handled by client-side tag collapsing.

#### Option C: Add DB-based dedup tracking (sent message log)
- **Pro:** Strong guarantee against duplicates across any execution context.
- **Con:** Adds DB writes on every push send, significant complexity, and must handle cleanup/TTL. Overkill given the existing three dedup layers plus the proposed `topic` header.

### CSRF Protection

#### Option D: Full CSRF token validation (synchronizer token pattern)
- **Pro:** Maximum protection. Standard OWASP recommendation.
- **Con:** Requires server-side token generation, storage, and validation. Adds complexity to every request cycle. The existing mitigations (`SameSite`, JSON content type, no CORS headers) already block cross-site requests in practice. No other API routes in the codebase use CSRF tokens.

#### Option E: Custom header check (`X-Requested-With`) (chosen)
- **Pro:** OWASP-recommended lightweight defense-in-depth. A custom header cannot be set on cross-origin "simple" requests — it triggers a CORS preflight. Since the server returns no `Access-Control-Allow-*` headers, the preflight fails and the browser blocks the request. One-line check on the server, one-line header addition on the client. Consistent with the existing `Content-Type` check pattern in `api/library/save/route.ts`.
- **Con:** Does not protect against requests from non-browser clients (but those wouldn't have cookies anyway). Relies on browser CORS enforcement (universally supported since ~2014).

#### Option F: Double-submit cookie pattern
- **Pro:** Stateless CSRF protection.
- **Con:** More complex than a custom header check. Requires cookie management. The custom header approach provides equivalent protection for our use case (same-origin API calls from a first-party SPA).

## Decision

**Deduplication:** Option B — Add `topic` to `webpush.sendNotification()` options in both `sendPushToUser` implementations. The topic is derived from the existing `tag` field (which already encodes notification type and episode ID, e.g., `new_episode-42`). If no tag is provided, no topic is set (preserving current behavior).

**CSRF:** Option E — Add a custom `X-Requested-With: fetch` header check to the push subscribe/unsubscribe API route. The client (`notification-settings.tsx`) adds the header to its `fetch()` calls. The server rejects requests missing the header with a `403 Forbidden` response.

> **Policy exception:** The CodeGuard guideline (`codeguard-0-client-side-web-security.instructions.md`) recommends framework-native synchronizer tokens on all state-changing requests. This ADR records an approved exception for the push subscribe route: Next.js App Router provides no built-in CSRF token mechanism, and the layered mitigations already in place (`SameSite` cookies, JSON `Content-Type` CORS preflight, no `Access-Control-Allow-*` headers, push endpoint allowlist, 60-second JWT expiry) make a custom header check equivalent in practice for same-origin SPA API calls. The same guideline also endorses custom headers for API mutations in SPA token models, which is the pattern applied here.

### Design Details

**Topic derivation:** The `tag` field is already URL-safe and descriptive (e.g., `new_episode-42`, `summary_completed-15`). Since `topic` has a 32-character limit and must be URL-safe base64, the tag value is used directly when it fits (most tags are well under 32 chars). No encoding or hashing is needed.

**Custom header check:** The `X-Requested-With` check is inlined directly in the POST and DELETE handlers of the push subscribe route. Since only one route needs this check, extracting a shared helper would be premature abstraction. If other routes adopt this pattern in the future, a helper can be extracted then.

## Consequences

- `sendPushToUser` gains a fourth dedup layer (protocol-level topic coalescing) with no behavioral change for online devices. Offline devices benefit from reduced duplicate notifications.
- The push subscribe API route gains an explicit CSRF check. Any existing client code that calls this route without the custom header will receive a 403. Currently, only `notification-settings.tsx` calls this route — it is updated in the same change.
- The service worker's background sync does NOT call the push subscribe route, so no changes are needed in `sw.js`.
- Existing tests for the push subscribe route need the `X-Requested-With` header added to their request construction.
- No new dependencies, schema changes, or Doppler changes.
