# ADR-038: EpisodeCard Left-Accent Bar Indicates Listen State

**Status:** Accepted
**Date:** 2026-04-24
**Issue:** [#345](https://github.com/Chalet-Labs/contentgenie/issues/345)
**Relates to:** [ADR-021](021-listen-history-tracking.md) (listen history tracking)

---

## Context

`EpisodeCard` (`src/components/episodes/episode-card.tsx`) is the shared primitive used to render episodes in podcast detail (via `src/components/podcasts/episode-card.tsx`, which wraps the primitive and is consumed by `episode-list.tsx`), library (`src/components/library/saved-episode-card.tsx`), and notifications (`src/components/notifications/notification-page-list.tsx`). The trending detail page (`src/app/(app)/trending/[slug]/trending-detail-content.tsx`) renders episodes via its own local `EpisodeCard` function (defined inline at the top of the file) and does **not** use the shared primitive.

Today the card applies a brand-colored 2px left border when `status === "completed"` (i.e. the AI summary has finished):

```tsx
status === "completed" && "border-l-2 border-l-primary"
```

That signal duplicates information the `WorthItBadge` already communicates more precisely — a completed summary is already visible as a numeric score (or "Not rated") in the top-right of the card. The only episodes that render without a badge are ones whose caller omits the `score` prop entirely; in those views the completion accent bar carries no user value anyway because there is no paired score to contextualize it.

Meanwhile, listen state — surfaced by `ListenedButton` (issue #335) — has no persistent card-level visual treatment. Unlistened and listened episodes look identical except for the button icon in the action row, which users must scan for individually. Browsing a long list of episodes to spot "what haven't I heard yet?" requires scanning every row.

## Decision

Repurpose the EpisodeCard left-accent bar to indicate listen state instead of summary state:

- **Remove** the `status === "completed" && "border-l-2 border-l-primary"` class.
- **Add** `isListened !== true && "border-l-2 border-l-primary"` so the brand-colored bar marks **unlistened** cards.
- `isListened === true` (i.e. the user has heard this episode) renders with no accent bar.
- Worth-It score continues to communicate summary state on its own.

Scope of the bar change is limited to the `EpisodeCard` primitive's class logic plus a single caller patch. The primitive has three consumers: `podcasts/episode-card.tsx` (the podcast-detail wrapper), `library/saved-episode-card.tsx`, and `notifications/notification-page-list.tsx`. The first two already thread `isListened` through to the primitive. `NotificationRow` in `notification-page-list.tsx` previously threaded `isListened` only to `ListenedButton` and not to `EpisodeCard`; this change adds the missing `isListened={isListened}` prop so listened notifications correctly hide the bar.

Trending detail (`src/app/(app)/trending/[slug]/trending-detail-content.tsx`) is **out of scope** for this ADR: it renders episodes via a local `EpisodeCard` function that never consumed the shared primitive, so the listen-state bar will not appear on trending detail until that local component is either unified with the primitive or gains equivalent bar logic. Tracked as follow-up.

The `accent` prop union (`"unread" | "none"`) is **not** extended. Notifications continue to use `accent="unread"` to apply the bg-tint treatment, which is an orthogonal axis to the listen-state bar. The two treatments can coexist on the same card without visual conflict: the `accent="unread"` bg-tint fills the card body, while the listen-state bar sits on the left edge.

### Notification cards gain the listen-state bar (scope clarification)

The issue's original "notification cards: unchanged" framing is imprecise. `NotificationRow` in `src/components/notifications/notification-page-list.tsx` now threads `isListened` to `EpisodeCard` (previously it was only passed to `ListenedButton`), so the new logic **does** apply to notification cards. We accept this outcome rather than introduce a suppression prop. Rationale:

- A notification card for an unlistened episode is itself an unlistened-episode surface — the bar is semantically accurate and consistent with every other list of episode cards in the app.
- `accent="unread"` (notification read/unread) and `isListened` (episode listened/not) are independent axes. A *read* notification for an *unlistened* episode should still show the bar; an *unread* notification for a *listened* episode should still show the bg-tint without a bar. Suppressing the bar in the notification context would collapse these axes incorrectly.
- Introducing a `showListenedBar={false}` (or equivalent) escape hatch would add prop surface purely to preserve an incidental current-state artifact, violating "don't design for hypothetical future requirements".

### `isListened = false` default is load-bearing

The `isListened` prop defaults to `false`. After this change, that default means **every** card rendered without an explicit `isListened` prop will show the bar. This is the correct failure mode — a caller that does not know listen state should assume "unlistened" and surface the activity marker (false-positive bar is a smaller UX error than false-negative silent listened state). All three current primitive consumers explicitly pass `isListened`, so the default acts as a safety net rather than the common path.

## Consequences

### Positive

- Users can scan a list and immediately see which episodes they have not yet listened to — the bar becomes a persistent, lightweight activity marker that complements the existing `ListenedButton` toggle.
- The summary-state bar is removed, eliminating information duplication with the Worth-It score badge.
- No new prop surface. The new behavior derives from the existing `isListened` prop; the `status` prop keeps its meaning (still drives the spinner/alert icon) but loses its cosmetic border side effect.
- Notification cards remain visually distinct via `accent="unread"` — the bar is additive, not replacing the unread bg-tint.

### Negative

- Default unlistened cards now render with a left accent bar even on views that previously showed a plain card (e.g. a podcast detail list of fresh episodes). This is intentional — fresh content *is* unlistened content — but it is a visual density increase for users on those views.
- Any code or test that relied on the old `border-l-primary` class appearing for `status === "completed"` will need to update. A repo-wide check found no tests asserting on that class; only the `data-status` attribute is asserted, which is preserved.
- VRT baselines for `EpisodeCard` stories (both `src/components/episodes/episode-card.stories.tsx` and `src/components/podcasts/episode-card.stories.tsx`) will need regeneration on the CI Linux runner because most of those stories render unlistened (no `isListened=true`), so they will now gain a left bar. This is routine baseline maintenance per ADR-024.

### Risks

- **Users conflate "no bar" with "no summary" (the old meaning).** Mitigation: the Worth-It score badge is a stronger, more specific signal for summary state and sits in the top-right corner of every card that has one. The bar's new meaning is reinforced by the `ListenedButton` in the action row — toggling it flips the bar.
- **Listened state lags the true state briefly** (e.g. just after `ListenedButton` fires but before the caller refreshes). The bar will momentarily show the old value. This is the same coherence window that already exists for the button itself — no new coherence problem.
