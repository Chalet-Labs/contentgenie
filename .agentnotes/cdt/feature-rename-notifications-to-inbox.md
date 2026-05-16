# Branch: feature/rename-notifications-to-inbox

**Created**: 2026-05-16
**First plan**: .dev/cdt/plans/plan-20260516-1454.md

---

## Session 20260516-1542

**Task**: Implement spec `.dev/pm/specs/2026-05-16-rename-notifications-to-inbox.md` — rename `/notifications` to `/inbox` and add a sidebar entry with unread badge.
**Plan**: .dev/cdt/plans/plan-20260516-1454.md

### What's Done
Page directory renamed (`src/app/(app)/notifications/` → `inbox/`), sidebar Inbox entry added with live badge, dispatch helper centralized, predicate dedup, pre-PR review applied 11 fixes. PR #467 open.

### Open Questions
- Bookmark / external link compatibility: spec line 35 explicitly chose **no redirect from `/notifications`** based on `rg` verification that no email, push payload, or Trigger.dev task deep-links to the old URL. Codex baseline flagged user bookmarks as a residual risk. Add a Next.js permanent redirect in `next.config.mjs` if analytics shows `/notifications` 404s in the next telemetry window.
- Badge-clears-when-bell-opens UX caveat is intentional, per spec lines 29–30. A separate "inbox triage backlog" metric (episodes not yet listened/dismissed) would decouple the sidebar inbox badge from the bell's unread count. Out of scope.
- `getDashboardStats` all-or-nothing on `Promise.all` is pre-existing; the PR added a third counter to the same Promise.all. A `Promise.allSettled` migration would isolate per-counter failures.

### Context for Next Session
- **Single dispatch entry point**: `src/lib/events.ts` — `dispatchNotificationsChanged(episodeDbIds)` is the typed-CustomEvent helper. Future sites that mutate notification state should call this rather than `new CustomEvent(...)`.
- **Single unread predicate**: `src/lib/notifications-query.ts` — `countUnreadNotifications(userId)` is the only place defining `isRead=false AND isDismissed=false`. Both `getUnreadCount` and `getDashboardStats` call it.
- **Bell now dispatches** (`src/components/notifications/notification-bell.tsx:113-122`): `NOTIFICATIONS_CHANGED_EVENT` on `markAllNotificationsRead` success, **only when `prev > 0`** (skips the no-op cascade on empty bell-open). Prior to this PR the bell only listened.
- **Page-list dispatches** (`src/components/notifications/notification-page-list.tsx`): both `handleMarkAllRead` and `handleDismiss` dispatch on success — the sidebar badge updates after in-page mutations, not only on bell-open.
- **Sidebar a11y**: active link sets `aria-current="page"`; tests query by `current: "page"` rather than the `bg-accent` Tailwind class (theme-refactor-safe).
- Pre-PR review caught and fixed during planning: schema-mismatch bug (PM cycle-1 finding — `readAt`/`isNull` → `isRead`/`isDismissed`). And during pre-PR validation: predicate duplication, missing dispatch from page-list, missing typed-event generic, brittle CSS active-state assertion, weak `expect.anything()` predicate test.

### References
- PR: https://github.com/Chalet-Labs/contentgenie/pull/467
- Plan: .dev/cdt/plans/plan-20260516-1454.md
- Spec: .dev/pm/specs/2026-05-16-rename-notifications-to-inbox.md
