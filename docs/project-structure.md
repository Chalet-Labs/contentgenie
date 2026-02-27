# Project Structure

## Directory Layout

```
src/
├── app/
│   ├── layout.tsx            # Root layout (ClerkProvider, ThemeProvider, Toaster)
│   ├── page.tsx              # Landing page (public)
│   ├── globals.css
│   ├── actions/              # Server actions (mutations)
│   │   ├── collections.ts
│   │   ├── dashboard.ts
│   │   ├── library.ts
│   │   └── subscriptions.ts
│   ├── api/                  # API routes (external service calls)
│   │   ├── episodes/[id]/route.ts
│   │   ├── episodes/summarize/route.ts
│   │   └── podcasts/search/route.ts
│   ├── (app)/                # Authenticated app routes
│   │   ├── layout.tsx        # App shell with sidebar
│   │   ├── dashboard/
│   │   ├── discover/
│   │   ├── episode/
│   │   ├── library/
│   │   ├── podcast/
│   │   ├── settings/
│   │   └── subscriptions/
│   └── (auth)/               # Auth routes (sign-in, sign-up)
├── components/
│   ├── ui/                   # shadcn/ui primitives (button, card, dialog, etc.)
│   ├── layout/               # Header, sidebar
│   ├── dashboard/            # Stats cards, recommendations, recent episodes
│   ├── podcasts/             # Podcast/episode cards, search results, subscribe
│   ├── episodes/             # Summary display, ratings, save button
│   └── library/              # Saved episodes, collections, bookmarks, notes
├── db/
│   ├── index.ts              # Neon connection (drizzle + neon serverless)
│   └── schema.ts             # Drizzle schema & relations
├── hooks/
│   └── use-online-status.ts  # React hook for navigator.onLine
├── lib/
│   ├── ai/                   # AI provider abstraction (OpenRouter + Z.AI)
│   ├── offline-cache.ts      # IndexedDB cache service (idb-keyval)
│   ├── podcastindex.ts       # PodcastIndex API client
│   ├── prompts.ts            # AI prompt templates
│   └── utils.ts              # cn() utility (clsx + tailwind-merge)
├── middleware.ts              # Clerk auth middleware (protects non-public routes)
└── trigger/
    ├── summarize-episode.ts  # Durable summarization task (Trigger.dev)
    └── helpers/              # Shared helpers for trigger tasks
```

## Database Schema

Tables: `users`, `podcasts`, `episodes`, `user_subscriptions`, `collections`, `user_library`, `bookmarks`, `ai_config`, `push_subscriptions`, `notifications`

- Users are synced from Clerk (text ID primary key).
- Podcasts and episodes reference PodcastIndex IDs.
- Episodes have AI-generated fields: `summary`, `key_takeaways`, `worth_it_score`, `worth_it_reason`.
- Type exports available: `User`, `Podcast`, `Episode`, `UserSubscription`, `Collection`, `UserLibraryEntry`, `Bookmark` (and `New*` variants).
- Schema is defined in `src/db/schema.ts`. After changes: `bun run db:generate` → `bun run db:push`.
- **Production** schema changes are applied manually (`doppler run --config prd -- bunx drizzle-kit push`). Preview deployments run `drizzle-kit push --force` automatically via the `vercel-build` script.

## Architecture Patterns

- **Route groups:** `(auth)` for sign-in/sign-up, `(app)` for authenticated pages with shared sidebar layout.
- **Server actions** (`src/app/actions/`) for all data mutations — subscriptions, library management, collections.
- **API routes** (`src/app/api/`) for proxying external services (PodcastIndex, episode summarization) and orchestrating Trigger.dev background tasks (OPML import, batch summarization).
- **Clerk middleware** protects all routes except `/`, `/sign-in`, `/sign-up`, and `/api/webhooks`.
- **Component organization:** Feature folders (`dashboard/`, `podcasts/`, `episodes/`, `library/`) alongside shared `ui/` primitives.

## Architecture Decision Records

ADRs document significant technical decisions. Read the relevant ADR before modifying areas it covers.

| ADR | Topic |
|-----|-------|
| [001](adr/001-distributed-rate-limiting.md) | Distributed Rate Limiting |
| [002](adr/002-preview-database-migrations.md) | Preview Database Migrations |
| [003](adr/003-scheduled-feed-polling.md) | Scheduled Feed Polling |
| [004](adr/004-audio-player-state-management.md) | Audio Player State Management |
| [005](adr/005-dns-pinning-ssrf-agent.md) | DNS-Pinning Fetch / SSRF Protection |
| [006](adr/006-opml-import-via-trigger-dev.md) | Bulk OPML Import via Trigger.dev |
| [007](adr/007-bulk-resummarize-via-trigger-dev.md) | Bulk Re-Summarization via Trigger.dev |
| [008](adr/008-ai-provider-abstraction.md) | AI Provider Abstraction Layer |
| [009](adr/009-notification-system-architecture.md) | In-App and PWA Push Notifications |
| [010](adr/010-per-user-daily-summarization-limit.md) | Per-User Daily Summarization Rate Limit |
| [011](adr/011-offline-reading-cache.md) | Offline Reading via IndexedDB Cache |
