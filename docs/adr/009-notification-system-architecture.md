# ADR-009: In-App and PWA Push Notification System

**Status:** Accepted
**Date:** 2026-02-26
**Issue:** [#39](https://github.com/Chalet-Labs/contentgenie/issues/39)

## Context

ContentGenie users need to know when new episodes appear from subscribed podcasts and when AI-generated summaries complete. Currently, users only discover new content by manually visiting the dashboard or podcast pages. The codebase has a registered service worker (`public/sw.js`) with caching strategies and offline support, a PWA registration component, per-subscription `notificationsEnabled` flags, and placeholder notification settings UI with "Coming Soon" buttons -- but no functional notification delivery.

Issue #39 requires two notification channels:
1. **In-app notifications:** A bell icon in the header with an unread count badge and a dropdown listing recent notifications (new episodes and completed summaries). Clicking a notification navigates to the episode page and marks it as read.
2. **PWA push notifications:** Web Push notifications delivered via the service worker, with click-to-open behavior navigating to the episode page. Users can configure global push toggle, per-subscription opt-out, and digest frequency (realtime, daily, weekly).

## Options Considered

### Option A: Polling-based in-app notifications (no push)

A `notifications` table in the database. The client polls an API endpoint every 30-60 seconds for new notifications. No push infrastructure.

- **Pro:** Simplest implementation. No new dependencies. No service worker changes. No VAPID keys or push subscription management.
- **Con:** Does not meet PWA push notification requirements. Polling wastes resources when there are no new notifications (most of the time). Latency of 30-60s for notification delivery. Does not work when the app is not open.

### Option B: In-app DB notifications + Web Push via `web-push` library (chosen)

A `notifications` table for in-app records and a `push_subscriptions` table for Web Push endpoints. The `web-push` npm package handles VAPID authentication and push message encryption. Trigger.dev tasks create notification records and dispatch push notifications after discovering new episodes or completing summaries. A scheduled Trigger.dev task handles digest batching (daily/weekly).

- **Pro:** Full-featured: in-app notifications work with or without push permission. Web Push works even when the app is closed. The `web-push` library (MIT, 3.6k GitHub stars, actively maintained) is the standard Node.js implementation of the Web Push Protocol (RFC 8030) and VAPID (RFC 8292). VAPID keys are managed as Doppler secrets -- no third-party push service vendor. Digest scheduling via Trigger.dev follows the existing `schedules.task` pattern (ADR-003). Stale push subscriptions are automatically cleaned up on 404/410 responses.
- **Con:** New dependency (`web-push`). Two new database tables. VAPID keys must be generated once and added to Doppler (all environments) and Trigger.dev Prod dashboard. Service worker gains push event handling code.

### Option C: Third-party push service (OneSignal, Firebase Cloud Messaging)

Use a managed push notification service for both in-app and push delivery.

- **Pro:** Managed infrastructure. Rich analytics. Cross-platform support (iOS, Android) if needed later.
- **Con:** New vendor dependency and account. Privacy concerns (user subscription data leaves our infrastructure). Monthly costs at scale. Vendor lock-in on SDK and dashboard. Overkill for web-only PWA push. The `web-push` library handles the same Web Push Protocol standards directly.

### Option D: Server-Sent Events (SSE) for real-time in-app

Use SSE for real-time in-app notification delivery instead of polling or database-driven approach.

- **Pro:** Real-time delivery without polling overhead. No new database tables for delivery tracking.
- **Con:** Requires persistent connections -- expensive on Vercel serverless (connections time out). Does not work when the app is closed. Still needs a database table for notification history (mark as read, notification list). Does not replace the need for Web Push.

## Decision

**Option B: In-app DB notifications + Web Push via `web-push` library.**

### Key Design Decisions

1. **Two new database tables.** `notifications` stores in-app notification records (type, userId, episodeId, title, body, read status, timestamps). `push_subscriptions` stores Web Push subscription endpoints per user (endpoint, p256dh key, auth key, user agent). Both have appropriate indexes and foreign keys with `ON DELETE CASCADE` to the `users` table.

2. **Notification types.** Two initial types: `new_episode` and `summary_completed`. The `type` column is a text field with a check constraint, extensible for future types (e.g., `collection_shared`, `weekly_digest`). Each notification links to an `episodeId` for navigation.

3. **`web-push` library with VAPID.** VAPID (Voluntary Application Server Identification) keys are generated once via `bunx web-push generate-vapid-keys --json` and stored in Doppler as three secrets: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Public, inlined at build time -- the browser needs this for `PushManager.subscribe({ applicationServerKey })`), `VAPID_PRIVATE_KEY` (Server only), and `VAPID_SUBJECT` (Server only, `mailto:` URL for push service contact). The `web-push` library handles all encryption and protocol details. No GCM API key is needed -- VAPID is the modern standard supported by all major browsers. The library ships bundled TypeScript types since v3.6.x. **Important:** `web-push` uses Node.js `crypto` internals and must be added to `serverComponentsExternalPackages` in `next.config.mjs` to avoid Webpack polyfill errors.

4. **Notification creation happens in Trigger.dev tasks.** After `pollNewEpisodes` discovers new episodes, it creates `new_episode` notifications for all subscribers of that podcast (respecting `notificationsEnabled` per subscription). After `summarizeEpisode` completes, it creates a `summary_completed` notification for subscribers. This is a natural extension of the existing task flow -- notifications are a side effect of episode discovery and summarization.

5. **Push dispatch is fire-and-forget from notification creation.** When a notification record is created, the same code path also sends push notifications to all active push subscriptions for that user. Failed push sends (network errors) are logged but do not fail the notification creation. 404/410 responses from the push service indicate expired subscriptions -- these are automatically deleted from the `push_subscriptions` table (stale subscription cleanup).

6. **Digest frequency support via user preferences and a scheduled task.** Users can choose `realtime`, `daily`, or `weekly` digest frequency. The preference is stored in the `users.preferences` JSON column (extending the existing `notifications?: boolean` field to a richer structure). For `realtime`, notifications are dispatched immediately. For `daily`/`weekly`, push notifications are suppressed at creation time; a new `send-notification-digests` Trigger.dev scheduled task runs every hour, queries users with pending unread notifications whose digest window has elapsed, and sends a single batched push notification per user.

7. **Push subscription management via API route.** A `POST /api/push/subscribe` endpoint receives the browser's `PushSubscription` object (from `pushManager.subscribe()`) and upserts it into the `push_subscriptions` table (`ON CONFLICT endpoint DO UPDATE` to handle re-subscriptions from the same browser). A `DELETE /api/push/subscribe` endpoint removes it (for unsubscribe). Both endpoints require Clerk authentication. The VAPID public key is available client-side via the `NEXT_PUBLIC_VAPID_PUBLIC_KEY` environment variable (inlined at build time), so no separate API endpoint is needed to expose it. Note: `PushSubscription` must be serialized via `JSON.parse(JSON.stringify(sub))` before sending to the server.

8. **Service worker push event handling.** The existing `public/sw.js` gains a `push` event listener that parses the notification payload and calls `self.registration.showNotification()` with a `tag` option to collapse duplicate notifications of the same type/episode. A `notificationclick` event listener uses `clients.matchAll()` to find an existing app window and focus/navigate it, falling back to `clients.openWindow()` if no window is open. The payload format is `{ title, body, icon, badge, tag, data: { url } }`. Additionally, `next.config.mjs` should set `Cache-Control: no-cache` headers for `sw.js` to ensure browsers always fetch the latest version.

9. **In-app notification bell in the header.** A `NotificationBell` client component is added to `header.tsx`, positioned between the theme toggle and the user button. It shows a bell icon with an unread count badge (red dot with number). Clicking opens a dropdown (using Radix `Popover`) listing recent notifications. The dropdown fetches notifications via a server action (`getNotifications`) and supports "Mark all as read" and individual click-to-navigate-and-mark-read. The unread count is fetched on mount and refreshed on a 60-second interval (acceptable latency for a bell badge -- this is not the real-time delivery mechanism).

10. **Settings page notification controls.** The existing "Coming Soon" buttons in the Notifications card are replaced with functional controls: (a) a global push notification toggle (requests browser permission and subscribes/unsubscribes), (b) a digest frequency selector (realtime/daily/weekly), and (c) per-subscription notification toggles are already present in the subscriptions page via `notificationsEnabled`. Email notifications remain "Coming Soon" (out of scope for this issue).

11. **Graceful fallback for denied push permission.** If the user denies push notification permission, the in-app bell still works fully. The settings page shows a clear message explaining that push notifications are blocked and how to re-enable them in browser settings. The push toggle is disabled when permission is `denied`.

12. **Three new Doppler secrets, no new environments.** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Public, inlined at build time), `VAPID_PRIVATE_KEY` (Server), and `VAPID_SUBJECT` (Server, `mailto:` URL) are added to all Doppler configs (`dev`, `stg`, `prd`). `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are also added manually to the Trigger.dev Prod dashboard (following the pattern from ADR-008 / docs/secrets-management.md). Since `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is inlined at build time, the Trigger.dev runtime accesses it differently -- it can be set as a non-public env var there. VAPID key rotation invalidates all existing push subscriptions -- keys are long-lived by design.

13. **`next.config.mjs` changes.** Two additions: (a) `serverComponentsExternalPackages: ["web-push"]` in the `experimental` config to prevent Webpack from bundling the `web-push` library's Node.js `crypto` usage. (b) Custom headers for `/sw.js` to set `Cache-Control: no-cache, no-store, must-revalidate` ensuring browsers always fetch the latest service worker.

14. **iOS Safari limitation.** PWA push notifications on iOS Safari only work when the app is installed to the home screen (iOS 16.4+). The settings page should note this limitation. In-app notifications work in all browsers regardless.

## Consequences

- Two new database tables require a migration (`db:generate` + `db:push`). Preview deployments auto-migrate; production requires manual `db:push` before/with deployment (per the existing pattern noted in MEMORY.md).
- A new npm dependency (`web-push`) is added. It ships bundled TypeScript types and has no transitive dependencies that conflict with the existing stack. It must be listed in `serverComponentsExternalPackages` in `next.config.mjs`.
- Three new Doppler secrets (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) must be generated and added to all environments. `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` must also be added to the Trigger.dev Prod dashboard manually. Since `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is inlined at build time, a rebuild is required after changing it.
- The `pollNewEpisodes` and `summarizeEpisode` tasks gain notification creation as a post-processing step. This adds ~50-100ms of DB writes per notification batch -- negligible relative to the API calls and AI processing in these tasks.
- The service worker (`sw.js`) grows from a caching-only worker to also handle push events. The `push` and `notificationclick` event listeners are additive and do not affect existing caching behavior.
- Push notification delivery depends on the user's browser supporting the Push API and granting permission. In-app notifications work regardless.
- The digest scheduled task adds one more Trigger.dev task to the project, running hourly. It is lightweight (DB query + push sends) and should complete well within the 300s default `maxDuration`.
- AGENTS.md should be updated to reference this ADR (ADR-009).
