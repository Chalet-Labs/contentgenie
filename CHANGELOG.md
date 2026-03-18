# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
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
