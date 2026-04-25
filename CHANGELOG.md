# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Storybook test-runner smoke job in CI (#327). Every story is mounted in real headless Chromium via `@storybook/test-runner`; render-time errors, unhandled rejections, and `console.error` calls (via `TEST_RUNNER_FAIL_ON_CONSOLE`) now fail the build, closing the gap that let PR #292's `setStorybookIsAdmin` dead-code regression slip through Vitest, `build-storybook`, and TypeScript. Adds a `bun run test:storybook` script for local use (assumes `bun run storybook` running on port 6006). Also adds `play()` assertions to `Layout/Sidebar > WithAdmin` and `> InSheetWithAdmin` that assert the admin link is visible — these stories now double as behavior tests alongside VRT.
- Pinned podcasts sidebar section: collapsible list under the Subscriptions row showing pinned podcasts with artwork + title; expand state persists in localStorage; refreshes on "pins-changed" window events (#343).
- `docs/code-review-checklist.md` — reviewer rubric covering a11y patterns, magic numbers, test anti-patterns, upstream-transformation tests, and duplication-consolidation judgment. Referenced once from `AGENTS.md` so it stays on-demand rather than loaded into every agent invocation (#323).
- Sort dropdown and pin toggle on `/subscriptions` (epic #336, sub-issue #339). The list portion is now a `"use client"` component (`SubscriptionsList`) that renders a shadcn `<Select>` with "Recently added", "Title (A–Z)", "Latest episode", "Recently listened"; changing it calls `setSubscriptionSort` and `router.refresh()` so the server re-fetches in the new order. Each `SubscriptionCard` gains a `Pin`/`PinOff` toggle with `aria-pressed` + descriptive `aria-label`, wired to `togglePinSubscription` with optimistic state, `router.refresh()` on success, and rollback-on-failure toast (covers both `{success:false}` envelopes and action rejections). Optimistic overrides reconcile against the refreshed server props via `useEffect`, so the displayed pin state converges on the authoritative DB value and the list reorders without a hard reload. (Implementation note: React 18.3.1 stable does not expose `useOptimistic` at runtime, so the optimistic state uses the established `useState + useTransition` pattern from `listened-button.tsx` — identical UX to what the issue spec described with `useOptimistic`.) A new `getUserSubscriptionSort()` helper wraps the private `resolveSort` so the page reads the same preference value the action would otherwise fall back to internally; `resolveSort` logs preference-read DB failures under a distinct `[resolveSort]` tag so ops can distinguish "no preference stored" from "DB unreachable".
- Subscription sort + pin server actions (epic #336, sub-issue #338). `getUserSubscriptions(sort?)` now accepts an optional `SubscriptionSort` and falls back to `users.preferences.subscriptionSort` (default `"recently-added"`); the query emits a single SQL statement that orders by `is_pinned DESC` first, then the selected sort (including a `LEFT JOIN` on `listen_history` + `episodes` with `MAX(started_at)` for `"recently-listened"`, with a `subscribedAt DESC` tiebreaker for never-played podcasts). New `togglePinSubscription(subscriptionId)` flips pin state atomically via SQL `NOT is_pinned` with composite user+id ownership enforcement, and new `setSubscriptionSort(sort)` merges the choice into existing `users.preferences` without clobbering other keys. Both new actions use `ActionResult<T>` envelopes and Zod validation. UI wiring follows in the next sub-issue.
- "Mark as listened" button on episode cards (podcast detail, trending, and library surfaces). Tapping the check-icon button optimistically flips the UI to a non-interactive "Already listened" indicator, calls `recordListenEvent`, and reverts with a toast on failure. A new `getListenedEpisodeIds` server action batch-fetches listened state per page. Marking an episode listened causes it to stop appearing in the dashboard "For You" feed on the next render (#330).
- Schema groundwork for `/subscriptions` sort options and pinning (epic #336, sub-issue #337): `user_subscriptions.is_pinned` boolean column (DEFAULT false NOT NULL) with a **concurrently-built** partial index `user_subscriptions_pinned_idx ON (user_id) WHERE is_pinned = true` so the migration does not block writes on production; `users.preferences` typed JSON shape gains `subscriptionSort?: SubscriptionSort`; new exported `SUBSCRIPTION_SORTS` `as const` tuple and derived `SubscriptionSort` type alias in `src/db/schema.ts` (single source of truth for the typed JSON shape, server-action Zod validation in the next sub-issue, and UI). Migration `drizzle/0022_brainy_blink.sql`. Server-action and UI wiring follow in subsequent sub-issues.
- Notification bell now opens a grouped-summary popover (desktop) / full-width Sheet (mobile) instead of navigating directly to `/notifications`. The popover shows aggregated rows ("N new episodes since last visit", "N new episodes from {Podcast}"), a persistent "See all" footer, and loading/error/empty states. Clicking a row navigates to `/notifications?since=<iso>` or `/notifications?podcast=<id>` which filter the list server-side. The bell badge and 60-second polling are unchanged; opening the popover does not auto-mark-as-read. New server action `getNotificationSummary()` powers the aggregation (#312).
- Dashboard Trending Topics and Recommended Episodes cards now collapse to a 3-item preview with a ghost full-width "Show N more" / "Show less" toggle when there are more items to reveal. The Recommended Episodes server fetch limit was raised from 6 to 12 so the toggle has headroom to expand (#308).

### Changed

- Topics query (`getTopicsByPodcastIndexId`) now caps per-episode results with a Postgres `row_number() OVER (PARTITION BY episode_id)` window function instead of a JS loop, so only `TOPICS_PER_EPISODE_LIMIT` rows are sent across the wire per episode (3a).
- `PlayEpisodeButton` now uses `aria-disabled` + `aria-disabled:opacity-50 aria-disabled:cursor-not-allowed` Tailwind utilities instead of native `disabled`, keeping the button keyboard-focusable and screen-reader–accessible when an episode is actively playing (3b).
- `TOPICS_PER_EPISODE_LIMIT` is now derived as `MAX_DISPLAYED_TOPICS + 1` from the shared `src/lib/episodes/topic-display.ts` module (consumed by both `EpisodeCard` and the topics server helper), linking the DB cap to the primitive's chip count without forcing the server to import a component (3c).
- Tightened ESLint a11y coverage: `.eslintrc.json` now extends `plugin:jsx-a11y/recommended` plus an explicit rule subset (`no-static-element-interactions`, `click-events-have-key-events`, `anchor-is-valid`, `no-noninteractive-element-interactions`, `aria-props`, `role-has-required-aria-props`) pinned to `error`. `eslint-plugin-jsx-a11y` is now an explicit devDependency instead of relying on the transitive `eslint-config-next` install. Fixed the `role="combobox"` trigger in the admin prompt-template card to include the required `aria-expanded` / `aria-controls` props (the popover id is now generated via `useId()` so multiple instances on one page cannot collide). `SubscriptionCard` now uses the stretched-link pattern — the `<Link>` is anchored to the title with `after:absolute after:inset-0` instead of wrapping the whole card, so the nested Subscribe/Pin buttons are no longer invalid interactive descendants of an `<a>`. Radix test mocks that render a non-interactive fallback element carry line-level disables with justifications (#322).
- EpisodeCard now shows a brand-colored left accent bar on unlistened episodes instead of summarized ones; Worth-It score badge continues to indicate summary state (see ADR-038).
- Adopted Prettier + `prettier-plugin-tailwindcss` for automated Tailwind class ordering. New `bun run format` / `bun run format:check` scripts. Pre-commit hook now runs `format:check` before lint and tests, failing fast on formatting drift. Initial repo-wide format pass landed as a separate commit to keep blame clean (#321).
- Episode card affordances unified across notifications and the podcast detail episode list (post-#344 follow-up). A new shared `PlayEpisodeButton` (icon variant, at `src/components/audio-player/play-episode-button.tsx`) replaces the bespoke text "Listen" button on notifications and is added to the podcasts wrapper — both surfaces now expose Play, Add-to-queue, and "Mark as listened" as an icon row, in that order. The podcast detail list also renders topic chips per episode when the row has been summarized (new `TOPICS_PER_EPISODE_LIMIT=4` batch-fetch at `src/app/(app)/podcast/[id]/page.tsx`, keyed by PodcastIndex id). `AddToQueueButton` is no longer hover-revealed on podcasts detail — visible by default, matching notifications. Notifications fetches listened state via `getListenedEpisodeIds` on the server and threads `initialListenedIds` through `NotificationPageList` so the ListenedButton shows the correct state on first paint. Notifications page container drops `max-w-2xl`; cards now fill the `max-w-6xl` shell like library and podcasts detail.
- Unified episode card rendering across notifications, podcast detail, and library behind a shared `EpisodeCard` primitive at `src/components/episodes/episode-card.tsx`. The primitive owns layout, artwork tile, score pill (`WorthItBadge`), processing status icon, topic chips, meta row, and action slots (`primaryAction`, `secondaryActions`). The bespoke `ScoreIndicator` helper in `podcasts/episode-card.tsx` is deleted; `"Summarized"`/`"Failed"` text pills are replaced by compact icon-only status indicators. `SavedEpisodeCard` keeps its `Collapsible` expansion body; `NotificationPageList` rows now expose a dedicated `Listen` button via the primary-action slot. The `Listen` button plays in place without navigating away. Unrated notifications still render a "Not rated" pill; the legacy completed-summary left-border accent is preserved. Saved library rows keep the `/podcast/{id}?from=library` link on the podcast title via a new `podcastHref` prop. Notifications without an `episodePodcastIndexId` hide the primary action entirely instead of silently routing to the dashboard (#344).
- Audio player redesigned to the "Centered Focus" layout: full-width seek bar on top; transport cluster centered via CSS grid (`grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]`) with chapter-prev / rewind pill / 56px play / forward pill / chapter-next; right-side ancillary controls (speed, sleep, bookmark, chapters, queue, volume, close). Skip defaults split asymmetric — back 10s, forward 30s — and the Media Session `seekbackward`/`seekforward` handlers pick them up automatically. Skip presses flash a 700ms `−10s` / `+30s` pill anchored above the player (monotonic-nonce keyed so rapid re-presses always re-animate; `aria-hidden` to avoid per-press screen-reader noise; state and pending timer cleared when the player becomes invisible). Chapter prev uses iPod-style restart-vs-previous (3s threshold); next falls through to `playNext()` when on the last chapter with a non-empty queue, and the aria-label flips between "Next chapter" and "Next episode" to match the actual action. Prev is hidden entirely for queue-only episodes (no dead "Previous episode" button). Mobile keeps the 2-row layout with chevron icons matching the new defaults.
- Notification bell popover now clears the unread badge on open and offers a "Clear all" button. Opening the popover fetches the current unread summary, then calls the existing `markAllNotificationsRead()` server action so the badge drops to 0 immediately (reverts optimistically if the mutation fails). Items in the popover stay visible for the duration of the open session — clicking a row navigates to the filtered `/notifications` page _and_ removes that group from the popover's displayed list (relevant when staying on the same pathname); "Clear all" empties the displayed list in one action. Because the `MAX(createdAt) WHERE isRead=true` expression that powers the "since last visit" group now advances to "just now" on every open, that label becomes semantically accurate. Rows remain visible on the full `/notifications` page (which filters only by `isDismissed`), just re-styled as read. No schema change.
- Notification summary popover correctness pass (PR #328 review follow-up): `getNotificationSummary()` `totalUnread` now counts all unread notification types (matches `getUnreadCount`), preventing the badge and popover from disagreeing for users with legacy `summary_completed` rows. `NotificationSummary` discriminated-union now embeds `sinceIso` into the `episodes_since_last_seen` variant (was top-level `lastSeenAt`), removing a non-null assertion. New fallback "N unread notifications" link when unread rows exist but none group into an episode bucket. `NotificationPageList` now accepts an optional `filter` prop that is threaded through "Load more" so paginated filtered views stay scoped. Invalid `?podcast=` / `?since=` values are now logged via `console.warn` (stricter `/^\d+$/` id parsing), and the notifications page forwards the active filter to the list component. Bell client additions: stale-fetch generation counter (open → close → open races), `console.error` logging on summary fetch failure, and removed the close-branch state reset that caused a skeleton flicker during the Radix exit animation.
- Design system refresh: new "Paper, fern, amber" palette replaces the blue + zinc chrome — emerald primary (`hsl(160 70% 29%)` — darkened from the initial `hsl(160 70% 35%)` proposal so the primary-button label reaches WCAG 2.1 AA 4.5:1; dedicated `--primary-hover` (`hsl(160 70% 24%)` / `hsl(156 60% 42%)` dark) replaces the prior `hover:bg-primary/90` alpha composite to keep the hover state AA-compliant), amber `--brand` accent for logo/marketing/star ratings, vermilion destructive, and green-tinted neutrals (H 150). Score palette shifts to a warmer green → chartreuse → amber → vermilion ramp. Status colors rebalanced. New brand logo (amber speech-bubble + soundwave glyph) replaces the Lucide `Headphones` brand mark in the app header, install banner, welcome card, and regenerated PWA icons (192/512/maskable/apple-touch/favicon). `src/components/brand/logo.tsx` is the canonical Logo component; `scripts/generate-pwa-icons.mjs` makes bitmap regeneration reproducible. Inline score indicators gain a `data-score-band` attribute for stable test assertions.
- Server-action envelope return types normalized: new `ActionResult<T = void>` alias at `src/types/action-result.ts` replaces the inline `{ success: true; data?: T } | { success: false; error: string }` unions in `player-session.ts`, `listening-queue.ts`, `listen-history.ts`, and the `updateAiConfig` / `updateSummarizationPrompt` exports of `ai-config.ts`. `recordListenEvent` is tightened from `{ success: boolean }` to `ActionResult<void>`; failure payloads now carry an `error: string` (previously absent) but no call site read that field. Raw-return actions and `getAiConfig` are unchanged (#306).
- Public marketing landing page (`/`) redesigned: editorial-clean hero with a live-feeling inbox surface + floating AI summary, four-feature bento grid (Worth-It Score, Key Takeaways, Library, Discover), four-step how-it-works flow, worked example summary, and a free-during-beta pricing card (50% off forever for grandfathered accounts). Adds JetBrains Mono alongside Inter via `next/font`. The previous minimal `LandingHeader` is replaced by `MarketingHeader` (brand mark, full nav, contrast CTA), which now also powers the signed-out public episode share page — share-link visitors can discover the product instead of hitting a nav-less dead end. Adds a `ContrastButton` wrapper (at `src/components/landing/contrast-button.tsx`) that composes the shadcn `Button` primitive with inverted-color styling for marketing CTAs — keeps `src/components/ui/button.tsx` pristine and shadcn-sync-safe.

### Fixed

- `Podcasts/EpisodeList > Default` and `> SingleEpisode` Storybook stories now render correctly. After `EpisodeCard` adopted `PlayEpisodeButton` (#350), these stories crashed at render with `useAudioPlayerAPI must be used within AudioPlayerProvider` — but the failure was invisible because Vitest excludes `*.stories.tsx`, `build-storybook` only compiles, and the VRT baselines were captured against the broken state (proven by `Default` and `SingleEpisode` having byte-identical baselines despite rendering different episode counts). The newly added Storybook test-runner smoke job caught both. The fix wraps the meta in a minimal `AudioPlayerAPI/State/Progress` context decorator with noop API + idle state, mirroring the pattern already used by `audio-player/*.stories.tsx`. **Follow-up:** trigger the manual "Update VRT Baselines" workflow on this branch after merge — the existing baselines for these two stories no longer match the now-correct render (#327).
- Android lock-screen / notification media controls now show `play + rewind + forward` instead of `play + skip-to-next`, and the lock-screen / CarPlay progress bar is draggable. The app stops registering Media Session `nexttrack` (Chrome on Android's compact slot ranked it above `seekforward`, hiding the `−10s / +30s` buttons added in PR #348) and wires `seekto` through the existing `api.seek()` clamp, guarded with `Number.isFinite`. Trade-off: advancing the queue from the lock screen now requires opening the app (#355).
- `getNotificationSummary()` no longer crashes with `TypeError: e.toISOString is not a function` in production. The raw `` sql<Date | null>`MAX(...)` `` aggregate bypasses Drizzle's `PgTimestamp.mapFromDriverValue`, so Neon's HTTP driver returns `lastSeen` as a string; the action now rehydrates to a real `Date` before the `gte(notifications.createdAt, lastSeenAt)` comparison and the `sinceIso` serialization. Regression test added.
- Worth-It Score no longer penalizes episodes for ads, sponsor reads, or promotional segments. `getSummarizationPrompt` now inlines ad-exclusion guards on the `staysFocused` and `timeJustified` signal descriptions, in the `-1` adjustment rules, and in the Bottom Line / `worthItReason` guidance. `SIGNAL_LABELS.staysFocused` and `SIGNAL_LABELS.timeJustified` were re-worded to reference _editorial_ content so the UI matches the prompt's intent. Score math and the `WorthItSignals` shape are unchanged (#317).
- Sidebar Storybook stories (`WithAdmin`, `InSheetWithAdmin`) now correctly render the admin link by passing `isAdmin: true` through story `args`. Post-#292, `Sidebar.isAdmin` became a required prop fed from `AppShellInner`, so the old `setStorybookIsAdmin` mutation was silently dead — `WithAdmin` stories rendered identically to their non-admin counterparts. Also removed the now-dead `setStorybookIsAdmin` / `isAdminMock` plumbing from `.storybook/mocks/clerk.ts` and dropped the unused `@storybook-mocks/*` path alias from `tsconfig.json` and `.storybook/main.ts` (#294).
- `setQueue` server action now uses `db.batch([delete, insert])` instead of `db.transaction`, which is unsupported on the `drizzle-orm/neon-http` driver. Every queue mutation (add/reorder/remove) in production was failing with "Couldn't sync queue — Rolling back" and reverting the optimistic UI (#309).
- `BatchSummarizeButton` on the podcast detail page now slices the passed-in episode list to the API's 20-episode batch limit before calling `/api/episodes/batch-summarize`, preventing 400 "Maximum 20 episodes per batch" errors when the page loads up to 200 episodes (#291).
- Dashboard Trending Topics card no longer disappears silently when the daily snapshot cron misses a run or returns zero topics. Stale snapshots (>48h) now render with an amber "Out of date" indicator, and empty snapshots render a "No trending topics yet — check back tomorrow" empty state. The section is only hidden when no snapshot has ever been generated.
- Trending topics trigger task now persists an empty snapshot when the LLM provider itself throws, so a failed cron run updates `generatedAt` and lets the dashboard empty-state surface the problem instead of keeping a week-old row.
- `ZaiProvider` now includes `finish_reason`, `completion_tokens`, `reasoning_tokens`, and a `reasoning_content` snippet in the "Invalid response format" error. Reasoning-capable Z.AI models (GLM-4.6 / GLM-5.x) burn tokens on chain-of-thought before emitting `content`; without these diagnostics, max-token exhaustion looked identical to an API-shape regression.

### Changed

- Trending topics trigger task: `MAX_EPISODES` lowered from 500 to 200, input field switched from `keyTakeaways` to `summary` for richer clustering context, and the LLM call now passes `maxTokens: 16000` so reasoning models (e.g. GLM-5.1) have headroom after chain-of-thought.
- Podcast detail page now loads up to 200 episodes (raised from 20 for PodcastIndex-sourced and 50 for RSS-sourced) and supports client-side title search within the loaded window (#291)
- Dashboard Trending Topics card redesigned as a vertical list with topic name, AI description (2-line clamp), episode count, and per-row link to `/trending/<slug>` (#281)

### Added

- Dedicated `/notifications` page with worth-it score badges, topic chips (up to 3 per row), inline Add-to-queue button, and optimistic dismiss with automatic rollback on server error and a Retry toast. Bell icon now links to the page and retains a poll-based unread badge. Schema: `notifications.isDismissed` boolean column (DEFAULT false NOT NULL) — **production requires `doppler run --config prd -- bunx drizzle-kit push` before or with code deploy** (#303)
- Cross-device sync for the listening queue and currently-playing episode. Queue and resume-position now round-trip through the server and reconcile on app mount or window focus. Concurrent mutations use last-commit-wins; active playback is never rewound by a server refetch. (#282)
- Public episode share pages for anonymous viewers at `/episode/[id]`, with a signed-out shell, read-only episode details, share/external links, existing summaries, and sign-up redirects for save/queue/library actions (#293)
- Trending topic detail page at /trending/<slug> with horizontal topic switcher and ranked episode list sorted by worth-it score (#280)
- Personal topic overlap indicators — shows contextual labels (e.g. "You've heard 3 similar episodes", "New topic for you") based on listen history and saved episodes. Recommendations deprioritize heavily-consumed topics (#262)
- `rank-episode-topics` daily Trigger.dev scheduled task (7 AM UTC) that ranks episodes within each topic via exhaustive pairwise LLM comparison; win-count aggregation with worthItScore tiebreaker; adaptive episode cap (10/topic for ≤20 topics, 5/topic for >20); up to 50 topics per run (#261)
- `topicRank` (integer, nullable) and `rankedAt` (timestamp, nullable) columns on `episode_topics` — rank 1 = best coverage of that topic (#261)
- `bestTopicRank` and `topRankedTopic` fields on `RecommendedEpisodeDTO` and `getRecommendedEpisodes()` response (#261)
- Extract 1–5 topic tags per episode during summarization; stored in new `episode_topics` junction table with relevance scores (0–1) and a cross-episode index for efficient topic queries (#259)
- Semantic CSS color tokens for score (`--score-exceptional` → `--score-skip`) and status indicators (`--status-success-*`, `--status-warning-*`, etc.) with light/dark mode variants and accessible foreground colors (#256)
- Blue-indigo brand accent color replacing stock shadcn neutral defaults (#256)
- Active nav link highlighting in desktop header (#256)
- Global `prefers-reduced-motion: reduce` rule disabling animations/transitions for accessibility (#256)
- Mobile Sheet-based collection navigation for library sidebar (#256)
- ShareButton dropdown menu with native Share, Copy link, and Copy with summary options (#252)
- Optional `summary` prop on ShareButton for richer share text (passes `worthItReason` on episodes)
- shadcn Form component with react-hook-form + Zod validation (#234)
- Migrated collection-dialog, bookmarks-list, ai-provider-card, rss-feed-form to structured form handling
- bookmark-button note popover uses native form submit
- Admin-only "Fetch & Summarize" button on the episode detail page when transcript is missing or failed (#232)
- Dedicated `/admin` panel with three sub-routes: Overview (aggregated stats dashboard with transcript coverage, summary coverage, queue depth, active fetches, failure trend, and recent failures), Settings (AI provider config + prompt template editor), and Episodes (filterable global table with pagination, row actions, and batch re-summarization) (#224)
- Prompt template editor: admins can write a custom summarization prompt with `{{transcript}}` and other placeholders, test it live against any real episode via streaming AI response (dry-run with full production fidelity), and persist it to the `aiConfig` table; `summarizationPrompt` nullable column added to `ai_config` table
- `POST /api/admin/test-prompt` — streaming prompt playground route using raw SSE fetch (no Vercel AI SDK); see ADR-008 addendum
- `POST /api/admin/batch-resummarize` — admin batch re-summarization by explicit episode IDs (no rate limit, returns `{ queued, skipped }`, fire-and-forget)
- Admin link in sidebar (visible to `org:admin` users only)

### Changed

- Notifications: one row per episode per subscriber. The poller creates the notification on discovery ("New episode: …"); the summarizer updates it in place when the summary lands ("Summary ready: …", unread resets). Push uses a shared `tag=episode-${episodeId}` so devices replace rather than stack. Admin-triggered re-summarization no longer produces duplicate notification rows. (#289)
- Unified in-app navigation — `Sidebar` is now the single source of truth for authenticated nav (desktop aside + mobile sheet); `Header` split into `AppHeader` (utility bar: logo, theme toggle, notifications, user menu, mobile hamburger) and `LandingHeader` (marketing: logo, theme, auth CTAs). Admin link is now reachable from mobile. Desktop aside breakpoint widened from `lg:` to `md:`. (#286)
- Trending topic snapshots now include a stable `slug` per topic, used as the URL identifier for topic detail pages.
- Replace 3-dimension numeric worth-it scoring with boolean signal hybrid (8 yes/no quality signals + ±1 adjustment) for more stable, interpretable episode scores (#260)
- Score and status badge components migrated from hardcoded Tailwind colors to semantic design tokens (#256)
- Empty state icons standardized to consistent `rounded-full bg-muted p-3` container pattern across 7 components (#256)
- `InstallBanner` uses semantic `bg-card`/`text-card-foreground` tokens instead of hardcoded zinc colors (#256)
- Library sidebar hidden on mobile with Sheet-based collection fallback (#256)
- `NotificationSettings` loading state uses `Skeleton` component instead of raw `animate-pulse` (#256)
- Collection page back navigation unified to Link + ArrowLeft + text pattern (#256)
- Share text across episode, podcast, and collection pages uses actual titles instead of generic "Check out..." text (#252)
- Migrated URL search param management to nuqs for type-safe state in discover search and admin episode filters; admin filter arrays now use comma-separated format (`?transcriptStatus=available,failed`) instead of repeated keys (ADR-030, #247)
- Admin status badge shows "unprocessed" instead of "none" for NULL `transcript_status` / `summary_status`, aligning with ADR-026 terminology (#239)
- Replaced raw HTML elements with shadcn/ui primitives across 11 component and settings files: `<label>` → `Label` (with `htmlFor`/`aria-labelledby` for form controls) or `<span>` (for non-form headings), `<button>` → `Button`, `<span>` score pills → `Badge`, and custom progress bars → `Progress`; extended `Progress` with `indicatorClassName` and `max` props (#233)
- Admin features (AI provider card, bulk re-summarize, missing transcripts) moved from `/settings` page to dedicated `/admin` panel; regular users no longer see or have access to these features
- `generateEpisodeSummary` now accepts an optional `customPrompt` parameter; when provided, `interpolatePrompt` is used instead of the default `getSummarizationPrompt`
- `summarize-episode` Trigger.dev task reads `summarizationPrompt` from `getActiveAiConfig()` and passes it to `generateEpisodeSummary` at execution time

### Removed

- `BulkResummarizeCard` component deleted (superseded by admin panel batch re-summarization)
- `MissingTranscriptsCard` component deleted (superseded by admin panel episodes table with transcript status filter)
- `summarize-episode` is now a pure consumer of existing transcripts: it reads the `transcription` column from the database and aborts with `AbortTaskRunError` if no transcript is present, instead of orchestrating `fetch-transcript` inline or generating a description-only fallback (ADR-027, #215)
- `persistEpisodeSummary` simplified to 3 parameters — transcript-related column writes are exclusively owned by `fetch-transcript` via `persistTranscript`
- Removed `"transcribing"` from `summaryStatus` CHECK constraint, TypeScript type, and `IN_PROGRESS_STATUSES` — transcript progress is tracked via `transcriptStatus` column
- `summarize-episode` `maxDuration` reduced from 7200s to 600s now that AssemblyAI wait is no longer part of the summarization pipeline
- Processing status badge for `"running"` state updated from "Transcribing..." to "Processing..."
- Summarization step progress UI removes `"fetching-transcript"` and `"transcribing-audio"` steps — summarization no longer fetches transcripts

### Fixed

- Upgrade Storybook 8.6.15 → 10.3.5 and swap framework from `@storybook/react-vite` to `@storybook/nextjs-vite` so stories that import `next/link`, `next/image`, or `next/navigation` render without `process is not defined` / `React is not defined` runtime errors (#298)
- Close mobile library sidebar sheet when tapping a collection or "All Saved" link, matching the site header fix from #283 (#284)
- Restore episode topic persistence on production by adding the missing `topic_rank`/`ranked_at` migration; PR #266 added the columns to the schema but never generated a migration, so production INSERTs into `episode_topics` failed (#275)
- Mobile nav touch targets increased from `py-2` to `py-3` for WCAG 2.1 AA 44px minimum (#256)
- Score badge contrast on yellow/orange backgrounds — foreground color now adapts per tier instead of hardcoded white (#256)
- Episode poller now triggers fetch-transcript before summarize-episode, fixing broken pipeline where newly discovered episodes always failed summarization due to missing transcript (#253)
- Admin transcript buttons showing incorrect state (all disabled) for episodes with NULL `transcript_status` — NULL is now normalized to `"missing"` at the component boundary, enabling Fetch Transcript and Fetch & Summarize (#239)
- Episode detail page transcript fetch button hidden for NULL-status episodes — NULL no longer short-circuits the early return in `EpisodeTranscriptFetchButton` (#239)
- Admin transcript fetch button no longer shows a stuck spinner after navigating away and back during an in-flight fetch (#238)
- Fixed admin episodes table links navigating to wrong episode page by using PodcastIndex episode ID instead of internal database PK (#240)
- Fixed notification click navigating to wrong episode page by using PodcastIndex episode ID instead of internal database PK (#229)
- Prevent stale summary status and scores on the podcast page: `buildSummaryMaps` now gates "completed" badge and `worthItScore` on `processedAt`, and the episode page invalidates the podcast page's Router Cache when summarization completes (#223)
- Add required `speech_models` parameter to AssemblyAI API calls to resolve 400 errors from the updated API

### Added

- Admin missing-transcripts panel on the settings page: shows count of episodes with null/missing/failed/fetching `transcriptStatus`, podcast dropdown filter, paginated episode list with status badges and error display, per-episode "Fetch" button, and "Fetch All" batch button (max 20). Backed by `getEpisodeTranscriptStats` server action and two new API routes (`POST /api/episodes/fetch-transcript`, `POST /api/episodes/batch-fetch-transcripts`). Stale `fetching` rows from crashed runs remain visible and are retryable (#216)
- Independent transcript tracking: `transcript_status`, `transcript_fetched_at`, and `transcript_error` columns on the episodes table with CHECK constraint, `TranscriptStatus` type export, updated persist helpers, and backfill migration (ADR-026, #214)
- Visual regression testing (VRT) with Playwright: all 33 Storybook stories are screenshot-tested on every PR against committed Linux/Chromium baselines; diff artifacts are uploaded on failure; Chromium cache keeps CI overhead to ~65–125s; baseline update workflow documented in ADR-024 (#203)
- New Episodes section rework: episodes are enriched with local worth-it scores and sorted scored-first, with a time-range toggle ("Last week" / "Since last login") for client-side filtering. Empty states, input validation, error rollback, and accessibility improvements (#206)
- Trending topics headline on the dashboard: displays AI-extracted topic clusters as styled pills between the queue and content grid, with staleness/empty auto-hide, Suspense skeleton, and shared `formatRelativeTime` utility (#193)
- Queue section on the dashboard showing the current audio player queue with worth-it score badges. Episodes without scores show a "Get score" button that triggers inline summarization with realtime progress tracking via `useRealtimeRun`. Scores for existing episodes are batch-fetched on load via a new `getQueueEpisodeScores` server action. Handles cached (200), job-triggered (202), daily-limit and hourly-burst rate-limit (429) responses (#190)
- Trending topics: daily scheduled Trigger.dev task analyzes recent episode summaries via LLM, extracts 5-8 topic clusters, and stores append-only snapshots in `trending_topics` table. `getTrendingTopics()` server action exposes the latest snapshot to the dashboard (#192)
- Badge pills on Subscriptions and Library sidebar/mobile menu items showing live subscription and saved episode counts; counts refresh on each navigation (#187)
- Listen history tracking: `listen_history` table records when users start (30s threshold) and complete episodes, with upsert semantics preserving first listen time and longest duration. The audio player fires `recordListenEvent` server action as fire-and-forget on `timeupdate` (≥30s, once per session) and `ended` events (#186)
- Chapter markers: display and navigate podcast chapters with seek bar markers and chapter list panel. Chapters are fetched asynchronously via a server-side proxy when an episode with a `chaptersUrl` starts playing. Includes binary-search current chapter tracking and responsive Popover/Sheet chapter panel (#97)
- Episode queue with drag-and-drop reorder, auto-play next with countdown toast, and queue persistence in localStorage (#94)
- Custom PWA install banner with engagement threshold (visiting 2 distinct pages or 30s on-site), 7-day dismissal cooldown, iOS manual install instructions on settings page (#92)
- Offline reading of saved episode summaries and key takeaways via IndexedDB cache with 7-day TTL, user-scoped storage, and automatic stale-while-revalidate refresh on reconnection (#89)
- Per-user daily summarization limit (configurable via `DAILY_SUMMARIZE_LIMIT` env var, default 5) with 24-hour rolling window enforcement on both single and batch summarize routes (#64)
- In-app notification bell with unread badge, dropdown list, and mark-as-read functionality (#39)
- PWA push notifications via Web Push Protocol with VAPID authentication (#39)
- Notification settings page with push toggle, digest frequency selector (realtime/daily/weekly) (#39)
- Automatic notifications on new episode discovery and AI summary completion (#39)
- Scheduled digest notification task (hourly cron) for daily/weekly batched push notifications (#39)
- `notifications` and `push_subscriptions` database tables with indexed queries (#39)
- ADR-009: In-App and PWA Push Notification System architecture decision record (#39)
- Description-based transcript URL extraction in episode summarization pipeline
- AssemblyAI async transcription via Trigger.dev webhook tokens (replaces blocking polling)
- AI provider abstraction with support for OpenRouter and Z.AI, admin-selectable via Settings page (#139)
- Dimensional worth-it scoring with uniqueness, actionability, and time-value sub-scores for AI episode summaries (#133)
- Score breakdown progress bars in episode summary display (#133)
- Bulk re-summarization via Trigger.dev with filters (podcast, date range, quality score), real-time progress tracking, and cancellation (#38)
- Bulk OPML import: upload an OPML file from the Discover page to subscribe to multiple podcasts at once, with real-time progress tracking (#36)
- DNS rebinding tests for `safeFetch` verifying TOCTOU protection via dns-pinning agent (#108)
- ADR-005 listed in AGENTS.md Architecture Decision Records section
- Share button on episode, podcast, and collection pages with Web Share API support and clipboard fallback (#83)
- Compact Worth It Score badge in episode header for above-the-fold visibility (#82)
- PWA support: app is installable on desktop and mobile with offline fallback page, custom service worker, and web app manifest (#87)
- Episode artwork and title in the audio player bar now link to the episode detail page (`/episode/[id]`), with hover feedback, aria-label for accessibility, and touch feedback on mobile (#115)

### Changed

- Extract transcript waterfall (cached → PodcastIndex → description URL → AssemblyAI) from `summarize-episode` into a standalone `fetch-transcript` Trigger.dev task; `summarize-episode` now delegates via `triggerAndWait` (#213)
- Reworked dashboard layout to vertical stack: Trending, Recommendations, Queue, New Episodes (#194)
- Replaced podcast-level recommendations on dashboard with episode-level recommendations ranked by Worth It score, excluding subscribed/saved/listened episodes (#189)
- `upsertPodcast` now accepts `updateOnConflict: "full" | "safe"` instead of a boolean. Client-facing paths pass `"safe"` which performs no metadata updates on conflict (only bumps `updatedAt` for RETURNING compatibility) and strips protected fields (`rssFeedUrl`, `source`) from INSERT values. Trusted Trigger.dev paths use `"full"` (#180)
- Added Zod input validation in `saveEpisodeToLibrary` and `subscribeToPodcast` server actions (#180)
- ADR-020: Client-path metadata refresh policy architecture decision record (#180)
- Optimized `saveEpisodeToLibrary` and `subscribeToPodcast` to use atomic upserts (`onConflictDoUpdate`/`onConflictDoNothing`), reducing DB round-trips from 7→4 and 5→3. `getUserSubscriptions` now excludes `description` column (~25% payload reduction).

### Removed

- Removed Recently Saved section from dashboard (#194)

### Fixed

- Fixed non-deterministic Storybook stories (trending-topics, sleep-timer-menu, notification-list, notification-bell) by replacing `Date.now()` / `new Date()` module-level calls with fixed ISO timestamps, making stories VRT-safe (#203)
- Cached summaries no longer consume hourly rate limit points in single summarize route (#64)
- Fixed Clerk hosted sign-in/sign-up not redirecting back to the app by replacing `CLERK_SIGN_IN_FORCE_REDIRECT_URL` / `CLERK_SIGN_UP_FORCE_REDIRECT_URL` with `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` (public-prefixed, fallback semantics so `auth.protect()` redirect takes precedence) and adding `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` for correct routing to embedded auth pages
- Fixed non-deterministic SSRF redirect tests by using public-IP fixtures instead of hostname-based URLs
- Fixed DNS rebinding TOCTOU vulnerability in SSRF-protected fetch by pinning validated DNS resolution to TCP connections via undici Agent (#80)
- Cancel stale discover search requests when query changes, preventing outdated results from overwriting current results (#104)
- Podcast page back navigation is now context-aware — shows "Back to Subscriptions", "Back to Dashboard", etc. based on where the user came from (#86)
- Discover page search query now persists in URL (`?q=`) — back navigation, bookmarks, and shared links restore search state (#85)
- SSRF vulnerability in podcast RSS subscription — validates URLs before fetching (#77)
- Authenticated users are now redirected from landing page to dashboard after login (#50)
- Episode detail page now returns 404 instead of 500 for invalid/missing PodcastIndex episode IDs (#52)
- Preview deployments no longer get 500 errors from schema drift — `drizzle-kit push` now runs in the Vercel build targeting the correct Neon branch

### Security

- Push notification topic header: `webpush.sendNotification()` now includes RFC 8030 `Topic` header derived from the notification tag, enabling push service message coalescing for offline devices (#159)
- CSRF custom header check on push subscribe/unsubscribe API route: requires `X-Requested-With: fetch` header, returning 403 Forbidden when missing (#159)
- ADR-018: Push Notification Hardening architecture decision record (#159)

### Refactored

- Replaced unsafe `as PodcastIndexPodcast` type assertions in search route with `PodcastSearchResult` DTO (#72)

### Removed

- GitHub Actions Neon branch workflow (`.github/workflows/neon-branch.yml`) — replaced by `vercel-build` script to eliminate dual Neon branch problem

### Changed

- Increased `summarize-episode` task `maxDuration` to 7200s (2 hours) for async transcription
- AI summarization prompt rewritten with anti-inflation anchoring and structured summary sections (TL;DR, What You'll Learn, Notable Quotes, Action Items, Bottom Line) (#133)
- Worth-it score labels recalibrated: "Exceptional" (8+), "Above Average" (6-7.9), "Average" (4-5.9), "Below Average" (2-3.9), "Skip" (<2) (#133)
- ADR-005 (DNS-Pinning SSRF Agent) status updated from "Proposed" to "Accepted" with #108 cross-reference
- Made entire subscription card clickable, consistent with podcast and episode cards (#84)
- Optimized subscription existence check by consolidating two sequential queries into a single JOIN query in `isSubscribedToPodcast`
- Consolidated `getEpisodeAverageRating` into a single JOIN query, reducing database round-trips from 2 to 1
- Optimized dashboard stats retrieval by using SQL `COUNT(*)` aggregation instead of in-memory counting, significantly reducing memory and network overhead (#71)
- Optimized collections sidebar loading by eliminating N+1 database queries in `getUserCollections` (single SQL aggregation via LEFT JOIN + GROUP BY)
- PodcastIndex API authentication headers are now stabilized to 30-second windows, enabling Next.js `fetch` caching and reducing redundant network requests
- Rate limiting upgraded from in-memory to distributed (Postgres-backed) for serverless compatibility
- CI workflow simplified to quality checks only (lint, test, Storybook); Vercel handles builds and deploys

### Added

- Persistent in-app audio player with play/pause, seek, skip ±15s, playback speed, volume, and OS media controls via Media Session API (#93)
- Post-merge schema drift detection CI job — alerts when Drizzle schema diverges from production database (#67)
- GitHub Actions workflow to delete Neon preview branches on PR close, preventing branch accumulation on the free plan
- Fuzzy podcast search with typo tolerance, host name matching, and local MiniSearch index (#55)
- Trigger.dev dry-run validation step in CI for PR builds (#25)
- Scheduled feed polling via Trigger.dev (every 2h) with manual refresh server action (#24)
- Persist AI-generated worth-it reason to database and expose in episode API responses (#56)
- AI summary status indicator (left border accent) and color-coded worth-it score on episode cards in podcast overview (#59)
- Batch DB query for summary data on PodcastIndex-sourced podcast pages (no per-episode API calls)
- Doppler-to-Trigger.dev secrets sync via `syncEnvVars` build extension (`trigger.config.ts`)
- Vercel deployment pipeline with automatic PR previews and production deploy on merge
- Doppler-to-Vercel integration for secrets sync across dev/preview/production environments
- Neon-to-Vercel integration for automatic per-PR database branches
- Trigger.dev GitHub integration for automatic task deployment on merge
- Batch episode summarization via Trigger.dev with concurrency-limited fan-out
- `BatchSummarizeButton` component on podcast detail page for bulk processing
- `/api/episodes/batch-summarize` endpoint with rate limiting and cached-episode filtering
- Realtime progress tracking for batch summarization runs
- Processing status tracking with granular pipeline stages (transcribing, summarizing)
- `ProcessingStatus` badge component for compact status display on episode cards
- `processingError` column for persistent error messages on failed summarizations
- Transcribing audio step in the realtime progress UI
- Failed episode detection on page load with stored error messages and retry

## [2026-02-08]

### Added

- AssemblyAI transcription integration for episode audio-to-text conversion
- RSS feed parser for direct podcast ingestion by URL
- "Add by RSS URL" UI and server action on the Discover page
- Durable episode summarization pipeline via Trigger.dev (replaces inline API summarization)

### Changed

- Migrated package manager from npm to Bun; lockfile is now `bun.lock`
- Enabled Turbopack for `next dev` (faster local development)

## [2026-02-07]

### Added

- Doppler integration for centralized secrets management (replaces `.env` files)
- Vitest unit test suite with React Testing Library
- Storybook component testing and visual development environment

### Fixed

- Resolved `next` binary path issue in CI build step

## [2026-02-02]

### Added

- Podcast search powered by PodcastIndex API
- Podcast detail page with episode listing
- Podcast subscription management
- AI-powered episode summarization via OpenRouter
- Episode detail page with AI summary display
- Personal library for saving episodes
- Collections for organizing saved content
- Notes and bookmarks on saved episodes
- User ratings on episodes
- Dashboard with personalized stats and recommendations
- Settings page with theme, notification, and account management
- Base layout and navigation with dark mode support (next-themes)
- Clerk authentication (sign-in, sign-up, protected routes)

## [2026-01-20]

### Added

- Initial project setup

[Unreleased]: https://github.com/Chalet-Labs/contentgenie/compare/4974644...HEAD
[2026-02-08]: https://github.com/Chalet-Labs/contentgenie/compare/23eee8f...4974644
[2026-02-07]: https://github.com/Chalet-Labs/contentgenie/compare/b635331...23eee8f
[2026-02-02]: https://github.com/Chalet-Labs/contentgenie/compare/f6a7781...b635331
[2026-01-20]: https://github.com/Chalet-Labs/contentgenie/commits/f6a7781
