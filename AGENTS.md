# ContentGenie

Podcast discovery, AI-powered summarization, and library management app for busy professionals.

## Tech Stack

- **Framework:** Next.js 14 (App Router), React 18, TypeScript
- **Styling:** Tailwind CSS, shadcn/ui (Radix primitives)
- **Auth:** Clerk (`@clerk/nextjs`)
- **Database:** Neon (serverless Postgres) via Drizzle ORM
- **AI:** OpenRouter API for episode summarization
- **Podcast Data:** PodcastIndex API
- **Background Jobs:** Trigger.dev (`@trigger.dev/sdk`)
- **Notifications:** Sonner (toast)
- **Theme:** next-themes (light/dark/system)

## Workflow

- Before planning any work, always pull the latest `main` (`git fetch upstream && git merge upstream/main` or equivalent).
- Before editing any code, always create a new branch from an up-to-date `main`.
- This is a fork. Remotes: `origin` = `rube-de/contentgenie`, `upstream` = `Chalet-Labs/contentgenie`.
- Push feature branches to `upstream` and open PRs against `upstream/main`.

## Dev environment tips

- Run `doppler setup` once after cloning to configure secrets injection. After that, `bun run dev` just works (scripts already wrap `doppler run --`).
- Use `doppler run -- <command>` if you need to run a one-off command that needs env vars outside of the bun scripts.
- The `@/*` path alias maps to `./src/*` — use it for all imports.
- shadcn/ui components live in `src/components/ui/`. Add new ones with `bunx shadcn@latest add <component>`.
- Server components are the default. Only add `"use client"` when you need browser APIs, hooks, or event handlers.
- Server actions use `"use server"` and live in `src/app/actions/`. They handle all data mutations.
- API routes in `src/app/api/` are for proxying external services only (PodcastIndex, OpenRouter).

## Development commands

```bash
bun run dev            # Start dev server (port 3000, Turbopack)
bun run build          # Production build
bun run lint           # ESLint (next lint)
bun run test           # Run Vitest unit tests
bun run test:watch     # Run tests in watch mode
bun run test:coverage  # Run tests with coverage (80% threshold on src/lib/)
bun run storybook      # Launch Storybook dev server (port 6006)
bun run build-storybook # Build static Storybook
bun run db:generate    # Generate Drizzle migrations
bun run db:push        # Push schema to database
bun run db:studio      # Open Drizzle Studio (DB browser)
bun run trigger:dev    # Start Trigger.dev dev server
bun run trigger:deploy # Deploy tasks to Trigger.dev Cloud
```

## Testing instructions

- **Test framework:** Vitest with React Testing Library. Config: `vitest.config.ts`, setup: `src/test/setup.ts`.
- **Component stories:** Storybook 8 (`@storybook/react-vite`). Config: `.storybook/main.ts`.
- CI is defined in `.github/workflows/ci.yml` — it runs lint, tests, Storybook build, and Next.js build on every PR to `main`.
- Always run `bun run lint`, `bun run test`, and `bun run build` before committing.
- Unit tests live in `__tests__/` directories co-located with source (`src/lib/__tests__/`, `src/components/__tests__/`, `src/app/api/__tests__/`).
- Stories live alongside components as `*.stories.tsx` files.
- After changing imports or moving files, run `bun run lint` to catch broken references.
- The pre-commit hook automatically runs lint and tests when a `test` script exists.

## PR and commit instructions

- Commit message format: `type: Description` (e.g. `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`).
- Keep commit messages concise (1-2 sentences) and focused on the "why".
- PR title: same format as commits, under 70 characters.
- PR body: include a `## Summary` with bullet points and a `## Test plan` checklist.
- Always run lint and build before pushing. The CI must pass.

## Project structure

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
│   ├── library/              # Saved episodes, collections, bookmarks, notes
│   └── theme-provider.tsx
├── db/
│   ├── index.ts              # Neon connection (drizzle + neon serverless)
│   └── schema.ts             # Drizzle schema & relations
├── lib/
│   ├── openrouter.ts         # OpenRouter API client
│   ├── podcastindex.ts       # PodcastIndex API client
│   ├── prompts.ts            # AI prompt templates
│   └── utils.ts              # cn() utility (clsx + tailwind-merge)
├── middleware.ts              # Clerk auth middleware (protects non-public routes)
└── trigger/
    ├── summarize-episode.ts  # Durable summarization task (Trigger.dev)
    └── helpers/              # Shared helpers for trigger tasks
```

## Architecture patterns

- **App Router with route groups:** `(auth)` for sign-in/sign-up, `(app)` for authenticated pages with shared sidebar layout.
- **Server actions** (`src/app/actions/`) for all data mutations — subscriptions, library management, collections.
- **API routes** (`src/app/api/`) for proxying external services (PodcastIndex search, episode summarization).
- **Clerk middleware** protects all routes except `/`, `/sign-in`, `/sign-up`, and `/api/webhooks`.
- **Component organization:** Feature folders (`dashboard/`, `podcasts/`, `episodes/`, `library/`) alongside shared `ui/` primitives.

## Database schema

Tables: `users`, `podcasts`, `episodes`, `user_subscriptions`, `collections`, `user_library`, `bookmarks`

- Users are synced from Clerk (text ID primary key).
- Podcasts/episodes reference PodcastIndex IDs.
- Episodes have AI-generated fields: `summary`, `key_takeaways`, `worth_it_score`.
- Type exports available: `User`, `Podcast`, `Episode`, `UserSubscription`, `Collection`, `UserLibraryEntry`, `Bookmark` (and `New*` variants).
- Schema is defined in `src/db/schema.ts`. After changes, run `bun run db:generate` then `bun run db:push`.

## Code style

- TypeScript strict mode.
- Functional React components (no classes).
- Server components by default; `"use client"` only when needed.
- `"use server"` directive for server actions.
- Imports use `@/` path alias.
- shadcn/ui components in `src/components/ui/`.
- Tailwind for all styling (no CSS modules).

## Environment & secrets

Secrets are managed via **Doppler** (not `.env` files). Run `doppler setup` after cloning.

Available environment variables:
- `CLERK_SECRET_KEY` — Clerk backend auth
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk frontend auth
- `DATABASE_URL` — Neon Postgres connection string
- `OPENROUTER_API_KEY` — OpenRouter AI API
- `PODCASTINDEX_API_KEY` — PodcastIndex API key
- `PODCASTINDEX_API_SECRET` — PodcastIndex API secret
- `NEXT_PUBLIC_APP_URL` — Application URL (inlined at build time)
- `TRIGGER_SECRET_KEY` — Trigger.dev secret key (background jobs)
- `ASSEMBLYAI_API_KEY` — AssemblyAI transcription API key

## Security

- All non-public routes protected by Clerk middleware.
- No `.env` files committed — Doppler handles secrets injection.
- Server actions validate `auth()` before mutations.
- API routes verify authentication before processing.
