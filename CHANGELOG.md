# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- PWA support: app is installable on desktop and mobile with offline fallback page, custom service worker, and web app manifest (#87)
- Episode artwork and title in the audio player bar now link to the episode detail page (`/episode/[id]`), with hover feedback, aria-label for accessibility, and touch feedback on mobile (#115)

### Fixed
- Podcast page back navigation is now context-aware — shows "Back to Subscriptions", "Back to Dashboard", etc. based on where the user came from (#86)
- Discover page search query now persists in URL (`?q=`) — back navigation, bookmarks, and shared links restore search state (#85)
- SSRF vulnerability in podcast RSS subscription — validates URLs before fetching (#77)
- Authenticated users are now redirected from landing page to dashboard after login (#50)
- Episode detail page now returns 404 instead of 500 for invalid/missing PodcastIndex episode IDs (#52)
- Preview deployments no longer get 500 errors from schema drift — `drizzle-kit push` now runs in the Vercel build targeting the correct Neon branch

### Refactored
- Replaced unsafe `as PodcastIndexPodcast` type assertions in search route with `PodcastSearchResult` DTO (#72)

### Removed
- GitHub Actions Neon branch workflow (`.github/workflows/neon-branch.yml`) — replaced by `vercel-build` script to eliminate dual Neon branch problem

### Changed
- Made entire subscription card clickable, consistent with podcast and episode cards (#84)
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
