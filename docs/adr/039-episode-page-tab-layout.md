# ADR-039: Episode Page Uses a Three-Tab Layout with Insights as Default

**Status:** Accepted
**Date:** 2026-04-24
**Relates to:** [ADR-004](004-audio-player-state-management.md) (audio player state, including chapters), [ADR-034](034-personal-topic-overlap-indicators.md) (topic overlap label in SummaryDisplay)

---

## Context

The authenticated episode detail page (`src/components/episodes/authenticated-episode-detail.tsx`) rendered its content as a long vertical stack under the episode header:

1. **About This Episode** — the raw RSS description (`episode.description`).
2. **AI-Powered Insights** — `<SummaryDisplay>` (Worth-It score, AI summary, key takeaways, admin re-summarize).

Two problems:

- **Hierarchy is inverted relative to the product's value prop.** The Worth-It score and AI summary are the reasons a listener chooses ContentGenie over a general-purpose podcast app. Placing the RSS description above them pushes the differentiator below the fold, particularly on short viewports, and signals to first-time users that the AI layer is a secondary feature.
- **Chapters data is invisible.** Episodes carry a `chaptersUrl` column (`src/db/schema.ts:407,433`) and the audio player context already fetches + parses it (`src/contexts/audio-player-context.tsx:107,155,172` + `src/lib/chapters.ts`). Users can navigate chapters via the player scrubber once playback starts, but there is no surface that lists chapters on the page itself — a missed discovery opportunity and no offline preview of an episode's structure.

A Claude Design handoff (`contentgenie-player-extended/project/Player Redesign.html`) proposed four alternative layouts (integrated, sidebar, tabs, two-column) and — after iterating in-chat — landed on a tab layout with AI insights as the default. The design-chat transcript captures the decisive user objection to the stacked approach: _"the integrated [layout] pushes the AI summary/worthit score far down, and it is one of the main features of the product, i don't have good feeling about this."_ Tabs put the differentiator first without removing the other content.

## Decision

Restructure the authenticated episode page body into a three-tab layout:

| Tab          | Content                                                                                   | Default                                               |
| ------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Insights** | `<SummaryDisplay>` (Worth-It score, AI summary, key takeaways, admin re-summarize button) | Yes — selected on page load                           |
| **Chapters** | Chapter list rendered from `chaptersUrl` via `parseChapters`, with click-to-seek          | Hidden when `chaptersUrl` is null/empty (no dead tab) |
| **About**    | Episode description (the existing "About This Episode" card content)                      | No                                                    |

The episode header (artwork, title, metadata, CTAs, ShareButton, WorthIt badge) stays above the tab bar — it's navigational/identity content that applies to all tabs.

### Visual style: underlined tabs, not segmented pills

The existing shadcn `Tabs` primitive in `src/components/ui/tabs.tsx` uses a segmented-pill style (`bg-muted` track, `data-[state=active]:bg-background` trigger). That primitive has a live consumer in `notification-page-list.tsx` where the pill style reads as "filter selection inside a toolbar" — appropriate for that context.

The episode-page tabs need to read as **page-level navigation between content sections**, not filters on a list. A flat underline bar (`border-b border-border` container, 2px `border-primary` underline on the active trigger) communicates that hierarchy and gives the tab bar enough weight to sit between the header and content without competing with either. The Chapters trigger includes a count badge (pill bg: `bg-primary/10 text-primary` active, `bg-muted text-muted-foreground` inactive) because the count is useful pre-click signal and the design calls for it.

Rather than edit `src/components/ui/tabs.tsx` (a shadcn primitive that the project convention forbids editing by hand, per AGENTS.md) or fork it via a CVA variant (which couples two unrelated consumers to a shared variant map), a new local primitive lives at `src/components/episodes/episode-tabs.tsx`. It wraps Radix `@radix-ui/react-tabs` directly — the same underlying library the shadcn file uses — so keyboard navigation, ARIA roles, and focus management match the rest of the app. Scope is intentionally narrow: the underline tabs are only used on the episode page for now. If other pages later need the same style, extract then.

### Chapters tab visibility

The Chapters trigger is conditionally rendered based on `Boolean(episode.chaptersUrl?.trim())`. When absent, the user sees a two-tab bar (Insights · About), not a greyed-out Chapters tab with an empty state. This avoids inviting clicks on a surface that will always be empty for that episode and keeps the information scent of the tab bar honest.

### What stays the same

- `<SummaryDisplay>` is unchanged — it moves wholesale into the Insights tab, still receives the same props (including the `overlapLabel` from ADR-034), and still renders identical loading / error / empty / populated states.
- The admin-only "Re-summarize" button still sits inline with the section title; the section title is now "AI-Powered Insights" inside the Insights tab content rather than a page-level heading. Admins keep access on the same paths.
- The header block above the tabs (ArtworkPlaceholder, title, category badges, metadata row, Listen/Add to queue/Save/Share buttons, CommunityRating) is not moved — it is page-level identity, not tab content.

## Scope — explicitly out

- **Public episode page** (`PublicEpisodeDetail`) keeps the linear layout. Public users have no summary data and usually no need for chapters; two of three tabs would be empty, producing dead UI for signed-out visitors. Revisit if/when public episodes gain teaser AI content.
- **Per-takeaway timestamps.** The design mocks show "Jump to {t}" affordances on each key takeaway, which would require migrating `keyTakeaways: string[]` (`src/db/schema.ts:97`) to `{ text: string; t: number }[]` and updating the summarizer prompt to emit timestamps. Separate change, separate ADR.
- **Nested tabs / future AI surfaces.** The tab taxonomy leaves room for later additions ("Transcript", "Ask this episode"), but no new tabs are added in this change. The primitive is flexible enough to grow; adding tabs later is a non-breaking edit.

## Consequences

### Positive

- AI insights land in first-fold on the default tab — the product's differentiator is visible immediately.
- Chapters become a discoverable navigation surface without adding any new fetch infrastructure (reuses `parseChapters` and the audio-player context's chapter state).
- The page body becomes scannable rather than scrollable; each tab has a single, clear purpose.
- Two new component files isolate the change and keep the shadcn primitives untouched — diffs are localized and easy to roll back.

### Neutral / Trade-offs

- Users who previously scanned the description before summaries now need one extra click to reach the description. This is an intentional hierarchy call; the value-prop case outweighs it.
- Tab state is ephemeral (local `useState`). Deep-linking to `?tab=chapters` would require `nuqs` (ADR-030) and is a small follow-up. First-cut acceptable for shipping.
- The Chapters tab fetches `chaptersUrl` client-side when active. JSON Chapters payloads can be cross-origin and slow; a small skeleton covers the latency. If this becomes hot, consider hoisting the fetch into the existing `/api/episodes/[id]` response.

### Risks / Watch-outs

- The existing test `authenticated-episode-detail.test.tsx` asserts the presence of `<SummaryDisplay>` and the absence of the re-summarize button for RSS episodes. These assertions continue to hold because Insights is the default tab; no test migration needed beyond extending coverage for the new tab switching behaviour.
- If a future tab adds interactive state (e.g., a transcript with scroll position), lifting tab state to URL becomes more valuable. Revisit then.
